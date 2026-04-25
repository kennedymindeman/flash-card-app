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
  const t = ac.currentTime;

  // Pop body — fast sine burst with upward pitch sweep
  const o1 = ac.createOscillator();
  const g1 = ac.createGain();
  o1.connect(g1);
  g1.connect(ac.destination);
  o1.type = "sine";
  o1.frequency.setValueAtTime(600, t);
  o1.frequency.exponentialRampToValueAtTime(1200, t + 0.08);
  g1.gain.setValueAtTime(0, t);
  g1.gain.linearRampToValueAtTime(0.3, t + 0.005);
  g1.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
  o1.start(t);
  o1.stop(t + 0.2);

  // Bright shimmer overtone
  const o2 = ac.createOscillator();
  const g2 = ac.createGain();
  o2.connect(g2);
  g2.connect(ac.destination);
  o2.type = "sine";
  o2.frequency.setValueAtTime(1800, t + 0.015);
  o2.frequency.exponentialRampToValueAtTime(2400, t + 0.06);
  g2.gain.setValueAtTime(0, t + 0.015);
  g2.gain.linearRampToValueAtTime(0.12, t + 0.02);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  o2.start(t + 0.015);
  o2.stop(t + 0.12);
}

function playWrong() {
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  const t = ac.currentTime;

  // Low thud
  const o1 = ac.createOscillator();
  const g1 = ac.createGain();
  o1.connect(g1);
  g1.connect(ac.destination);
  o1.type = "sine";
  o1.frequency.setValueAtTime(280, t);
  o1.frequency.exponentialRampToValueAtTime(180, t + 0.08);
  g1.gain.setValueAtTime(0, t);
  g1.gain.linearRampToValueAtTime(0.25, t + 0.005);
  g1.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  o1.start(t);
  o1.stop(t + 0.25);

  // Subtle buzz overtone
  const o2 = ac.createOscillator();
  const g2 = ac.createGain();
  o2.connect(g2);
  g2.connect(ac.destination);
  o2.type = "triangle";
  o2.frequency.setValueAtTime(360, t);
  o2.frequency.exponentialRampToValueAtTime(240, t + 0.1);
  g2.gain.setValueAtTime(0, t);
  g2.gain.linearRampToValueAtTime(0.12, t + 0.005);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  o2.start(t);
  o2.stop(t + 0.2);
}

function playNear() {
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  const t = ac.currentTime;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.connect(g);
  g.connect(ac.destination);
  o.type = "sine";
  o.frequency.setValueAtTime(440, t);
  o.frequency.exponentialRampToValueAtTime(520, t + 0.04);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.15, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  o.start(t);
  o.stop(t + 0.15);
}

function containsHangul(text) {
  return /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(text);
}

function levenshtein(a, b) {
  const m = a.length,
    n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

// --- Scoring ---

function score(input, answer) {
  const normInput = input.trim().toLowerCase();
  const normAnswer = answer.trim().toLowerCase();
  if (normInput === normAnswer) return "correct";
  if (containsHangul(normAnswer)) {
    const jamoInput = normInput.normalize("NFD");
    const jamoAnswer = normAnswer.normalize("NFD");
    const dist = levenshtein(jamoInput, jamoAnswer);
    if (dist === 1 && jamoAnswer.length > 4) return "near";
  }
  return "wrong";
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
      const reqs = c.requires || [];
      for (const req of reqs) {
        const reqState = cardState[req];
        if (!reqState || reqState.phase !== "srs") return false;
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

  // Clear on-card feedback
  const cfb = document.getElementById("card-feedback");
  if (cfb) cfb.innerHTML = "";

  // Remove any lingering shake classes
  const shell = document.querySelector(".shell");
  if (shell)
    shell.classList.remove("shake-wrong", "shake-correct", "shake-near");

  const input = document.getElementById("answer-input");
  input.value = "";
  input.disabled = false;
  input.focus();

  // Start timing on first keystroke
  keystrokeTimer = Date.now();
}

function showDone() {
  document.getElementById("quiz").style.display = "none";
  const zone = document.getElementById("answer-zone");
  if (zone) zone.style.display = "none";
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
  const result = score(val, card.response);

  if (result === "correct") {
    const responseMs = firstKeystrokeTime;
    await handleCorrect(currentPrompt, responseMs);
  } else if (result === "near") {
    handleNear();
  } else {
    handleWrong(card.response);
  }
}

async function handleCorrect(prompt, responseMs) {
  keystrokeTimer = null; // ignore keystrokes during transition
  playCorrect();

  // Bounce the card
  const shell = document.querySelector(".shell");
  if (shell) {
    shell.classList.remove("shake-correct");
    void shell.offsetWidth; // reflow to restart animation
    shell.classList.add("shake-correct");
  }

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

function handleNear() {
  playNear();

  const shell = document.querySelector(".shell");
  if (shell) {
    shell.classList.remove("shake-near");
    void shell.offsetWidth;
    shell.classList.add("shake-near");
  }

  const cfb = document.getElementById("card-feedback");
  if (cfb) {
    cfb.innerHTML =
      '<span class="card-feedback-label card-feedback-near">almost — try again</span>';
  }

  const input = document.getElementById("answer-input");
  input.value = "";
  input.focus();
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

    // Shake the card
    const shell = document.querySelector(".shell");
    if (shell) {
      shell.classList.remove("shake-wrong");
      void shell.offsetWidth; // reflow to restart animation
      shell.classList.add("shake-wrong");
    }

    // Show correct answer on the card
    const cfb = document.getElementById("card-feedback");
    if (cfb) {
      cfb.innerHTML = `<span class="card-feedback-label">correct answer</span><span class="card-feedback-answer">${correctResponse}</span>`;
    }
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
  if (data.error) {
    document.getElementById("question-text").textContent = data.error;
    const zone = document.getElementById("answer-zone");
    if (zone) zone.style.display = "none";
    return;
  }
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
