const CARDS = [
  { q: "What does HTTP stand for?", a: "hypertext transfer protocol" },
  { q: "What is the time complexity of binary search?", a: "o log n" },
  { q: "What keyword creates a function in Python?", a: "def" },
  { q: "What does CSS stand for?", a: "cascading style sheets" },
  { q: "What is 2 to the power of 10?", a: "1024" },
  { q: "What does SQL stand for?", a: "structured query language" },
  { q: "What symbol denotes a comment in Python?", a: "#" },
  { q: "What does RAM stand for?", a: "random access memory" },
];

let deck, idx, stats, checked;

// --- Theme ---

let theme = localStorage.getItem("dash-theme") || "auto";

function applyTheme() {
  const root = document.documentElement;
  if (theme === "auto") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }
  document.getElementById("theme-toggle").textContent =
    theme === "dark" ? "○" : theme === "light" ? "●" : "◐";
}

document.getElementById("theme-toggle").addEventListener("click", () => {
  theme = theme === "auto" ? "dark" : theme === "dark" ? "light" : "auto";
  localStorage.setItem("dash-theme", theme);
  applyTheme();
});

applyTheme();

// --- Scoring ---

function normalize(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fuzzyScore(input, answer) {
  const a = normalize(input);
  const b = normalize(answer);
  if (a === b) return "correct";
  const bWords = b.split(" ");
  const aWords = a.split(" ");
  const ratio = bWords.filter((w) => aWords.includes(w)).length / bWords.length;
  return ratio >= 0.4 ? "partial" : "wrong";
}

// --- Progress ---

function updateProgress() {
  const pct = Math.round((idx / deck.length) * 100);
  document.getElementById("progress-fill").style.width = pct + "%";
  document.getElementById("nav-prog").textContent = pct + "%";
}

// --- Stats ---

function updateStats() {
  ["correct", "partial", "wrong"].forEach((k) => {
    document.getElementById(`stat-${k}`).textContent = stats[k];
  });
}

// --- Lifecycle ---

function load() {
  deck = [...CARDS].sort(() => Math.random() - 0.5);
  idx = 0;
  stats = { correct: 0, partial: 0, wrong: 0 };
  checked = false;
  document.getElementById("done").classList.remove("show");
  document.getElementById("quiz").style.display = "";
  render();
}

function render() {
  const card = deck[idx];
  document.getElementById("question-text").textContent = card.q;
  document.getElementById("card-label").textContent =
    `Question ${idx + 1} of ${deck.length}`;
  updateProgress();

  const input = document.getElementById("answer-input");
  input.value = "";
  input.className = "";
  input.disabled = false;
  input.focus();

  const fb = document.getElementById("feedback");
  fb.className = "feedback";
  document.getElementById("fb-tag").textContent = "";
  document.getElementById("fb-answer").textContent = "";

  document.getElementById("submit-btn").textContent = "Check";

  checked = false;
  updateStats();
}

function check() {
  if (checked) {
    advance();
    return;
  }

  const input = document.getElementById("answer-input");
  const val = input.value.trim();
  if (!val) return;

  const result = fuzzyScore(val, deck[idx].a);
  stats[result]++;
  checked = true;
  input.disabled = true;
  input.className = result;

  const fb = document.getElementById("feedback");
  fb.className = `feedback show ${result}`;
  document.getElementById("fb-tag").textContent = {
    correct: "✓ Correct",
    partial: "~ Partial",
    wrong: "✗ Incorrect",
  }[result];
  document.getElementById("fb-answer").textContent = deck[idx].a;

  document.getElementById("submit-btn").textContent = "Next →";
  updateStats();
}

function advance() {
  if (++idx >= deck.length) showDone();
  else render();
}

function showDone() {
  document.getElementById("quiz").style.display = "none";
  document.getElementById("done").classList.add("show");
  document.getElementById("card-label").textContent = "Complete";
  document.getElementById("progress-fill").style.width = "100%";
  document.getElementById("nav-prog").textContent = "100%";
  document.getElementById("done-summary").textContent =
    `${stats.correct} correct · ${stats.partial} partial · ${stats.wrong} wrong`;
}

// --- Events ---

document.getElementById("submit-btn").addEventListener("click", check);
document.getElementById("restart-btn").addEventListener("click", load);
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter") check();
});

load();
