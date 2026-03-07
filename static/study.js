"use strict";

// --- Constants ---
const POOL_SIZE = 5;
const STREAK_TO_GRADUATE = 3;
const ACQUISITION_TIME_LIMIT_MS = 1000; // first keystroke must be within this

// --- State ---
const deckName = location.pathname.split("/").pop();

let allCards = []; // full deck from server: [{ prompt, response }]
let cardState = {}; // per-card state keyed by prompt
let pool = []; // prompts currently in the acquisition pool
let queue = []; // shuffled order for current pass
let currentPrompt = null;
let wronged = false;
let keystrokeTimer = null;
let firstKeystrokeTime = null;

// --- Audio ---

function playCorrect() {
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  [523, 784].forEach((freq, i) => {
    const o = ac.createOscillator(),
      g = ac.createGain();
    o.connect(g);
    g.connect(ac.destination);
    o.type = "sine";
    o.frequency.setValueAtTime(freq, ac.currentTime);
    const t = ac.currentTime + i * 0.13;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.25, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    o.start(t);
    o.stop(t + 0.4);
  });
}

function playWrong() {
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  [330, 220].forEach((freq, i) => {
    const o = ac.createOscillator(),
      g = ac.createGain();
    o.connect(g);
    g.connect(ac.destination);
    o.type = "sine";
    o.frequency.setValueAtTime(freq, ac.currentTime);
    const t = ac.currentTime + i * 0.14;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.25, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.start(t);
    o.stop(t + 0.35);
  });
}

// --- Scoring ---

function score(input, answer) {
  return input.trim().toLowerCase() === answer.trim().toLowerCase()
    ? "correct"
    : "wrong";
}

// --- SM-2 ---

const SM2_INITIAL_INTERVAL = 1; // days
const SM2_INITIAL_EASE = 2.5;
const SM2_MIN_EASE = 1.3;

/**
 * Given current card state and a quality score (0-5),
 * returns updated { interval, easeFactor, dueDate }.
 */
function sm2(state, quality) {
  let { interval = SM2_INITIAL_INTERVAL, easeFactor = SM2_INITIAL_EASE } =
    state;

  if (quality < 3) {
    interval = 1;
  } else {
    if (interval === SM2_INITIAL_INTERVAL) {
      interval = 1;
    } else if (interval === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }
    easeFactor = Math.max(
      SM2_MIN_EASE,
      easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02),
    );
  }

  const due = new Date();
  due.setDate(due.getDate() + interval);

  return {
    interval,
    easeFactor,
    dueDate: due.toISOString().split("T")[0],
  };
}

/**
 * Convert response time and correctness to SM-2 quality (0-5).
 * responseMs is time to first keystroke.
 */
function qualityFromResponse(correct, responseMs) {
  if (!correct) return 1;
  if (responseMs < 1000) return 5;
  if (responseMs < 2000) return 4;
  if (responseMs < 5000) return 3;
  return 2; // correct but very slow
}

// --- State persistence ---

async function saveCardState(prompt, state) {
  await fetch(`/api/deck/${deckName}/state`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, state }),
  });
}

// --- Card pool logic ---

function getOrInitState(prompt) {
  if (!cardState[prompt]) {
    cardState[prompt] = { phase: "acquisition", streak: 0 };
  }
  return cardState[prompt];
}

function acquisitionCards() {
  return allCards.filter((c) => {
    const s = getOrInitState(c.prompt);
    return s.phase === "acquisition";
  });
}

function srsCards() {
  const today = new Date().toISOString().split("T")[0];
  return allCards.filter((c) => {
    const s = cardState[c.prompt];
    return s && s.phase === "srs" && s.dueDate <= today;
  });
}

/**
 * Fill pool up to POOL_SIZE from acquisition cards not already in pool.
 */
function fillPool() {
  const inPool = new Set(pool);
  const candidates = acquisitionCards()
    .filter((c) => {
      if (inPool.has(c.prompt)) return false;
      if (c.reversedOf) {
        const sourceState = cardState[c.reversedOf];
        if (!sourceState || sourceState.phase !== "srs") return false;
      }
      return true;
    })
    .map((c) => c.prompt);
  let changed = false;
  while (pool.length < POOL_SIZE && candidates.length > 0) {
    const idx = Math.floor(Math.random() * candidates.length);
    pool.push(candidates.splice(idx, 1)[0]);
    changed = true;
  }
  if (changed) queue = []; // reset queue when pool composition changes
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickNext() {
  const candidates =
    pool.length > 0 ? [...pool] : srsCards().map((c) => c.prompt);

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  if (queue.length === 0) {
    const rest = candidates.filter((p) => p !== currentPrompt);
    shuffle(rest);
    if (currentPrompt && candidates.includes(currentPrompt)) {
      rest.push(currentPrompt);
    }
    queue = rest;
  }

  return queue.shift();
}

// --- Render ---

function render(prompt) {
  currentPrompt = prompt;
  wronged = false;
  firstKeystrokeTime = null;

  const card = allCards.find((c) => c.prompt === prompt);
  const qt = document.getElementById("question-text");
  qt.textContent = card.prompt;
  qt.classList.remove("fading");

  const sym = document.getElementById("prompt-sym");
  sym.textContent = "›";
  sym.style.color = "";
  sym.className = "prompt-sym";

  document.getElementById("feedback-row").textContent = "";

  const input = document.getElementById("answer-input");
  input.value = "";
  input.disabled = false;
  input.focus();

  // Start timing on first keystroke
  keystrokeTimer = Date.now();
}

function showDone() {
  document.getElementById("quiz").style.display = "none";
  const done = document.getElementById("done");
  done.classList.add("show");

  const srsDue = srsCards();
  const acq = acquisitionCards();
  let sub = "";
  if (acq.length > 0) {
    sub = `${acq.length} card${acq.length !== 1 ? "s" : ""} still in progress`;
  } else if (srsCards().length === 0) {
    sub = "come back tomorrow for your next review";
  }
  document.getElementById("done-sub").textContent = sub;
}

// --- Check answer ---

async function check() {
  const input = document.getElementById("answer-input");
  const val = input.value.trim();
  if (!val) return;

  // Record first keystroke time if not already captured
  if (firstKeystrokeTime === null) {
    firstKeystrokeTime = Date.now() - keystrokeTimer;
  }

  const card = allCards.find((c) => c.prompt === currentPrompt);
  const correct = score(val, card.response) === "correct";

  if (correct) {
    const responseMs = firstKeystrokeTime;
    await handleCorrect(currentPrompt, responseMs);
  } else {
    handleWrong(card.response);
  }
}

async function handleCorrect(prompt, responseMs) {
  keystrokeTimer = null; // ignore keystrokes during transition
  playCorrect();

  const sym = document.getElementById("prompt-sym");
  sym.textContent = "✓";
  sym.style.color = "var(--correct)";
  sym.classList.add("flash-correct");

  setTimeout(() => {
    document.getElementById("question-text").classList.add("fading");
  }, 300);

  // Update state
  const state = getOrInitState(prompt);

  if (state.phase === "acquisition") {
    if (!wronged) {
      state.streak = (state.streak || 0) + 1;
    } else {
      state.streak = 0;
    }

    if (state.streak >= STREAK_TO_GRADUATE) {
      // Graduate to SRS
      const quality = qualityFromResponse(true, responseMs);
      const srsUpdate = sm2(state, quality);
      state.phase = "srs";
      state.streak = 0;
      Object.assign(state, srsUpdate);
      pool = pool.filter((p) => p !== prompt);
      fillPool();
    }
  } else {
    // SRS review
    const quality = qualityFromResponse(true, responseMs);
    const srsUpdate = sm2(state, quality);
    Object.assign(state, srsUpdate);
  }

  await saveCardState(prompt, state);

  setTimeout(async () => {
    const next = pickNext();
    if (!next) {
      showDone();
    } else {
      render(next);
    }
  }, 700);
}

function handleWrong(correctResponse) {
  if (!wronged) {
    wronged = true;
    playWrong();

    // Reset streak
    const state = getOrInitState(currentPrompt);
    if (state.phase === "acquisition") {
      state.streak = 0;
    }

    const sym = document.getElementById("prompt-sym");
    sym.textContent = "✗";
    sym.style.color = "var(--wrong)";

    const fb = document.getElementById("feedback-row");
    fb.innerHTML = `<span>correct:</span><span class="feedback-answer">${correctResponse}</span>`;
  }

  const input = document.getElementById("answer-input");
  input.value = "";
  input.focus();
  // Reset keystroke timer for retry
  keystrokeTimer = Date.now();
  firstKeystrokeTime = null;
}

// --- Init ---

async function init() {
  const res = await fetch(`/api/deck/${deckName}`);
  const data = await res.json();
  allCards = data.cards;
  cardState = data.state;

  // Separate SRS due cards from acquisition
  const due = srsCards();
  const acq = acquisitionCards();

  if (due.length === 0 && acq.length === 0) {
    showDone();
    return;
  }

  // Fill acquisition pool
  fillPool();

  const first = pickNext();
  if (first) render(first);
  else showDone();
}

// --- Events ---

document.addEventListener("keydown", (e) => {
  if (e.key === "Enter") check();
});

// Capture first keystroke time on any key in the input
// keystrokeTimer is null during transitions -- ignore keystrokes then
document.getElementById("answer-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") return;
  if (firstKeystrokeTime === null && keystrokeTimer !== null) {
    firstKeystrokeTime = Date.now() - keystrokeTimer;
  }
});

init();
