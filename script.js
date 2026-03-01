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

let deck, idx, wronged;

// --- Theme ---

let theme = localStorage.getItem("mono-theme") || "auto";

function applyTheme() {
  const r = document.documentElement;
  if (theme === "auto") r.removeAttribute("data-theme");
  else r.setAttribute("data-theme", theme);
  document.getElementById("theme-btn").textContent =
    theme === "dark" ? "○" : theme === "light" ? "●" : "◐";
}

document.getElementById("theme-btn").addEventListener("click", () => {
  theme = theme === "auto" ? "dark" : theme === "dark" ? "light" : "auto";
  localStorage.setItem("mono-theme", theme);
  applyTheme();
});

applyTheme();

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

// --- Lifecycle ---

function load() {
  deck = [...CARDS].sort(() => Math.random() - 0.5);
  idx = 0;
  wronged = false;
  document.getElementById("done").classList.remove("show");
  document.getElementById("quiz").style.display = "";
  render();
}

function render() {
  const input = document.getElementById("answer-input");
  document.getElementById("question-text").textContent = deck[idx].q;
  document.getElementById("question-text").classList.remove("fading");
  document.getElementById("prompt-sym").className = "prompt-sym";
  document.getElementById("prompt-sym").textContent = "›";
  document.getElementById("prompt-sym").style.color = "";
  document.getElementById("answer-sym").textContent = "_";
  document.getElementById("feedback-row").textContent = "";
  input.value = "";
  input.disabled = false;
  wronged = false;
  input.focus();
}

function check() {
  const input = document.getElementById("answer-input");
  const val = input.value.trim();
  if (!val) return;

  const correct = score(val, deck[idx].a) === "correct";

  if (correct) {
    playCorrect();

    const sym = document.getElementById("prompt-sym");
    sym.textContent = "✓";
    sym.style.color = "var(--correct)";
    sym.classList.add("flash-correct");

    setTimeout(() => {
      document.getElementById("question-text").classList.add("fading");
    }, 300);

    setTimeout(() => {
      wronged = false;
      if (++idx >= deck.length) showDone();
      else render();
    }, 700);
  } else {
    if (!wronged) {
      wronged = true;
      playWrong();

      const sym = document.getElementById("prompt-sym");
      sym.textContent = "✗";
      sym.style.color = "var(--wrong)";

      const fb = document.getElementById("feedback-row");
      fb.innerHTML = `<span>correct:</span><span class="feedback-answer">${deck[idx].a}</span>`;
    }

    input.value = "";
    input.focus();
  }
}

function showDone() {
  document.getElementById("quiz").style.display = "none";
  document.getElementById("done").classList.add("show");
}

// --- Events ---

document.addEventListener("keydown", (e) => {
  if (e.key === "Enter") check();
});
load();
