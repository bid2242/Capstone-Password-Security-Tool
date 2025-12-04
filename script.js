// ==================== APP ENTRY & AUDIO SETUP ====================
let globalAudioCtx;

function initAudio() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  if (!globalAudioCtx) globalAudioCtx = new AudioCtx();
  if (globalAudioCtx.state === "suspended") globalAudioCtx.resume();
}

// Resume / unlock audio on first user interaction
document.addEventListener("click", initAudio);
document.addEventListener("keydown", initAudio);

// DOM ready
document.addEventListener("DOMContentLoaded", () => {
  setupThemeToggle();
  setupPasswordChecker();
  initQuiz();
});

/* ==================== THEME TOGGLE ==================== */
function setupThemeToggle() {
  const btn = document.getElementById("toggleTheme");
  const saved = localStorage.getItem("themeMode");

  if (saved === "light") {
    document.body.classList.add("light-theme");
    btn.textContent = "🎮 Neon Mode";
  } else {
    btn.textContent = "☀ Light Mode";
  }

  btn.addEventListener("click", () => {
    const isLight = document.body.classList.toggle("light-theme");
    localStorage.setItem("themeMode", isLight ? "light" : "dark");
    btn.textContent = isLight ? "🎮 Neon Mode" : "☀ Light Mode";
  });
}

/* ==================== PASSWORD CHECKER ==================== */
function setupPasswordChecker() {
  const pwInput = document.getElementById("passwordInput");
  const strengthText = document.getElementById("strengthText");
  const strengthFill = document.getElementById("strengthFill");
  const strengthBar = document.getElementById("strengthBar");
  const entropyText = document.getElementById("entropyText");
  const feedbackList = document.getElementById("feedbackList");
  const toggleShow = document.getElementById("toggleShow");
  const copyBtn = document.getElementById("copyPw");
  const breachBtn = document.getElementById("checkBreach");
  const breachStatus = document.getElementById("breachStatus");

  // Dashboard elements (make sure these exist in your HTML)
  const dashStrength = document.getElementById("dashStrength");
  const dashEntropy = document.getElementById("dashEntropy");
  const dashBreach = document.getElementById("dashBreach");
  const dashOverall = document.getElementById("dashOverall");

  const requirementItems = document.querySelectorAll(".req-item");

  let commonPasswords = new Set();
  let lastBreachInfo = "Not checked";

  // Load optional common password file
  fetch("common_passwords.txt")
    .then(res => res.text())
    .then(txt => {
      txt.split(/\r?\n/).forEach(line => {
        const p = line.trim();
        if (p) commonPasswords.add(p.toLowerCase());
      });
    })
    .catch(() => console.warn("common_passwords.txt not found (optional)."));

  // Input listener
  pwInput.addEventListener("input", () => {
    const pw = pwInput.value || "";
    const result = scorePassword(pw, commonPasswords);
    renderStrength(pw, result);
    updateRequirements(pw, commonPasswords, requirementItems);
    updateOverallDashboard(pw, result, lastBreachInfo);
  });

  toggleShow.addEventListener("click", () => {
    const show = pwInput.type === "password";
    pwInput.type = show ? "text" : "password";
    toggleShow.textContent = show ? "Hide" : "Show";
  });

  document.getElementById("genWeak").addEventListener("click", () => {
    setGeneratedPassword(pwInput, generateWeak());
  });
  document.getElementById("genStrong").addEventListener("click", () => {
    setGeneratedPassword(pwInput, generateStrong());
  });
  document.getElementById("genPass").addEventListener("click", () => {
    setGeneratedPassword(pwInput, generatePassphrase());
  });

  copyBtn.addEventListener("click", async () => {
    if (!pwInput.value) return;
    try {
      await navigator.clipboard.writeText(pwInput.value);
      copyBtn.textContent = "Copied!";
      setTimeout(() => (copyBtn.textContent = "Copy"), 1200);
    } catch {
      copyBtn.textContent = "Error";
      setTimeout(() => (copyBtn.textContent = "Copy"), 1200);
    }
  });

  // Breach check using HaveIBeenPwned k-anonymity API
  breachBtn.addEventListener("click", async () => {
    const pw = pwInput.value || "";
    if (!pw) {
      breachStatus.textContent = "Enter a password before checking for breaches.";
      return;
    }

    breachBtn.disabled = true;
    breachBtn.textContent = "Checking...";
    breachStatus.textContent = "Contacting breach database...";

    try {
      const hashHex = await sha1Hex(pw);
      const prefix = hashHex.slice(0, 5);
      const suffix = hashHex.slice(5);
      const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
      const text = await res.text();

      let foundCount = 0;
      text.split("\n").forEach(line => {
        const [hashSuffix, countStr] = line.trim().split(":");
        if (hashSuffix === suffix.toUpperCase()) {
          foundCount = parseInt(countStr, 10) || 0;
        }
      });

      if (foundCount > 0) {
        lastBreachInfo = `Found in ${foundCount.toLocaleString()} known breaches. Do NOT use this password.`;
        breachStatus.textContent = `❌ This password was found in ${foundCount.toLocaleString()} known breaches.`;
        dashBreach.textContent = `Compromised (${foundCount.toLocaleString()} hits)`;
        dashBreach.style.color = "#f97373";
      } else {
        lastBreachInfo = "Not found in Have I Been Pwned database at time of check.";
        breachStatus.textContent = "✅ This password was not found in the Have I Been Pwned database.";
        dashBreach.textContent = "Not found";
        dashBreach.style.color = "#22c55e";
      }
    } catch (err) {
      console.warn(err);
      breachStatus.textContent = "Unable to check breaches (network or CORS issue). Document this in your report.";
      dashBreach.textContent = "Check failed";
      dashBreach.style.color = "#facc15";
      lastBreachInfo = "Breach check failed.";
    } finally {
      breachBtn.disabled = false;
      breachBtn.textContent = "Check Breach";
      const currentPw = pwInput.value || "";
      const result = scorePassword(currentPw, commonPasswords);
      updateOverallDashboard(currentPw, result, lastBreachInfo);
    }
  });

  // Initialize view
  const initialResult = {
    score: 0,
    label: "—",
    suggestions: ["Start typing a password to see feedback."]
  };
  renderStrength("", initialResult);
  updateRequirements("", commonPasswords, requirementItems);
  updateOverallDashboard("", initialResult, lastBreachInfo);

  function setGeneratedPassword(input, pw) {
    input.value = pw;
    input.dispatchEvent(new Event("input"));
  }

  function renderStrength(pw, result) {
    strengthText.textContent = `Strength: ${result.label} (${result.score}/4)`;
    strengthBar.setAttribute("aria-valuenow", result.score);
    strengthFill.style.width = `${(result.score / 4) * 100}%`;

    const ent = calculateEntropy(pw);
    entropyText.textContent = `Entropy: ${ent.bits} bits (${ent.rating})`;

    // Dashboard basic values
    if (dashStrength) dashStrength.textContent = `${result.label} (${result.score}/4)`;
    if (dashEntropy) dashEntropy.textContent = `${ent.bits} bits`;

    feedbackList.innerHTML = "";
    result.suggestions.forEach(s => {
      const li = document.createElement("li");
      li.textContent = s;
      feedbackList.appendChild(li);
    });
  }

  function updateOverallDashboard(pw, resultOrPw, breachInfo) {
    const result = typeof resultOrPw === "object"
      ? resultOrPw
      : scorePassword(pw, commonPasswords);
    const ent = calculateEntropy(pw);
    let overall = "Weak";

    if (result.score >= 3 && ent.bits >= 50 && !(breachInfo || "").startsWith("Found")) {
      overall = "Strong";
    } else if (result.score >= 2 && ent.bits >= 35) {
      overall = "Fair";
    }

    if (!pw) overall = "—";

    if (dashOverall) dashOverall.textContent = overall;
    if (dashBreach && breachInfo) dashBreach.textContent = breachInfo;
  }
}

function updateRequirements(pw, commonPasswords, items) {
  const lower = pw.toLowerCase();
  const tests = {
    length: pw.length >= 12,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    number: /[0-9]/.test(pw),
    symbol: /[^A-Za-z0-9]/.test(pw),
    common: !pw || !commonPasswords.has(lower)
  };

  items.forEach(item => {
    const key = item.getAttribute("data-req");
    const met = tests[key];
    item.classList.toggle("met", met);
  });
}

function scorePassword(pw, commonPasswords) {
  if (!pw) {
    return {
      score: 0,
      label: "—",
      suggestions: ["Start typing a password to see feedback."]
    };
  }

  const suggestions = [];

  if (commonPasswords.has(pw.toLowerCase())) {
    suggestions.push("This password appears in common password lists — never use it.");
    return { score: 0, label: "Very Weak", suggestions };
  }

  let z = null;
  if (window.zxcvbn) {
    z = zxcvbn(pw);
  }

  let score = z ? z.score : 0;

  const hasUpper = /[A-Z]/.test(pw);
  const hasLower = /[a-z]/.test(pw);
  const hasNumber = /[0-9]/.test(pw);
  const hasSymbol = /[^A-Za-z0-9]/.test(pw);
  const length = pw.length;

  if (length < 8) suggestions.push("Use at least 8 characters (12+ recommended).");
  if (!hasUpper) suggestions.push("Add uppercase letters (A–Z).");
  if (!hasLower) suggestions.push("Add lowercase letters (a–z).");
  if (!hasNumber) suggestions.push("Add numbers (0–9).");
  if (!hasSymbol) suggestions.push("Add special characters (e.g., ! @ # $ %).");

  if (z && z.feedback && Array.isArray(z.feedback.suggestions)) {
    z.feedback.suggestions.forEach(s => suggestions.push(s));
  }

  const labels = ["Very Weak", "Weak", "Fair", "Strong", "Very Strong"];
  score = Math.min(Math.max(score, 0), 4);

  return { score, label: labels[score], suggestions };
}

function calculateEntropy(pw) {
  if (!pw) return { bits: 0, rating: "—" };

  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/[0-9]/.test(pw)) pool += 10;
  if (/[^A-Za-z0-9]/.test(pw)) pool += 32;

  if (!pool) return { bits: 0, rating: "Very Weak" };

  const bits = Math.round(Math.log2(Math.pow(pool, pw.length)));

  let rating =
    bits < 28 ? "Very Weak" :
    bits < 36 ? "Weak" :
    bits < 60 ? "Reasonable" :
    bits < 128 ? "Strong" :
    "Very Strong";

  return { bits, rating };
}

function generateWeak() {
  return Math.random().toString(36).slice(-6);
}

function generateStrong() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+";
  let out = "";
  for (let i = 0; i < 14; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function generatePassphrase() {
  const words = [
    "sun", "forest", "coffee", "river", "panda", "cloud",
    "night", "green", "rocket", "pixel", "ember", "storm",
    "lunar", "matrix", "cobalt", "ember", "signal", "engine"
  ];
  return Array.from({ length: 4 }, () =>
    words[Math.floor(Math.random() * words.length)]
  ).join("-");
}

// SHA-1 via Web Crypto for HaveIBeenPwned
async function sha1Hex(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  const view = new DataView(hashBuffer);
  let hex = "";
  for (let i = 0; i < view.byteLength; i++) {
    const b = view.getUint8(i).toString(16).padStart(2, "0");
    hex += b;
  }
  return hex;
}

/* ==================== QUIZ MODULE ==================== */
function initQuiz() {
  const quizContainer = document.getElementById("quizContainer");
  const startBtn = document.getElementById("startQuiz");
  const statsEl = document.getElementById("quizStats");
  const soundBtn = document.getElementById("toggleSound");

  if (!quizContainer || !startBtn) return;

  if (!window.questions || !questions.length) {
    console.warn("questions.js not loaded or empty");
    quizContainer.innerHTML = "<p>Quiz questions failed to load.</p>";
    return;
  }

  let selectedQuestions = [];
  let current = 0;
  let score = 0;
  let soundEnabled = false;

  // Load stats view at startup
  updateQuizStats();

  // Start button
  startBtn.addEventListener("click", startQuiz);

  // Sound toggle
  if (soundBtn) {
    soundBtn.addEventListener("click", () => {
      soundEnabled = !soundEnabled;
      soundBtn.textContent = soundEnabled ? "🔊 Sound On" : "🔇 Sound Off";
    });
  }

  // Delegate "Retake Quiz" clicks
  quizContainer.addEventListener("click", (e) => {
    if (e.target.id === "retryQuiz") {
      startQuiz();
    }
  });

  function startQuiz() {
    current = 0;
    score = 0;

    // Shuffle all questions and pick 5
    const shuffled = [...questions].sort(() => Math.random() - 0.5);
    selectedQuestions = shuffled.slice(0, 5);

    showQuestion();
  }

  function showQuestion() {
    const q = selectedQuestions[current];
    if (!q) return;

    // Shuffle answer options
    const shuffledOptions = q.options
      .map((opt, index) => ({ opt, index }))
      .sort(() => Math.random() - 0.5);

    quizContainer.innerHTML = `
      <div class="question-card">
        <p><strong>Question ${current + 1} of ${selectedQuestions.length}</strong></p>
        <h3>${escapeHtml(q.question)}</h3>
        
        <div id="opts">
          ${shuffledOptions
            .map(o => `<button class="optBtn" data-idx="${o.index}">${escapeHtml(o.opt)}</button>`)
            .join("")}
        </div>

        <div id="qfeedback" aria-live="polite"></div>
      </div>
    `;

    document.querySelectorAll(".optBtn").forEach(btn => {
      btn.addEventListener("click", onSelectAnswer);
    });
  }

  function onSelectAnswer(e) {
    const q = selectedQuestions[current];
    const selected = Number(e.target.dataset.idx);

    const isCorrect = selected === q.answer;
    if (isCorrect) score++;

    if (soundEnabled) {
      playTone(isCorrect ? 880 : 220);
    }

    const box = document.getElementById("qfeedback");
    box.innerHTML = `
      <p><strong>${isCorrect ? "Correct ✔" : "Incorrect ✖"}</strong></p>
      <p>${escapeHtml(q.explanation || "")}</p>
      <button id="nextBtn" class="btn-primary">
        ${current + 1 < selectedQuestions.length ? "Next Question" : "Finish Quiz"}
      </button>
    `;

    // Disable all option buttons
    document.querySelectorAll(".optBtn").forEach(btn => (btn.disabled = true));

    document.getElementById("nextBtn").addEventListener("click", () => {
      current++;
      if (current < selectedQuestions.length) showQuestion();
      else showResults();
    });
  }

  function showResults() {
    const total = selectedQuestions.length;
    const percent = Math.round((score / total) * 100);

    // PERFECT SCORE CELEBRATION
    if (score === total) {
      celebratePerfectScore();
      if (soundEnabled) playCelebrationSound();
      showMasterBadge();
    }

    let level, message, emoji;
    if (percent < 40) {
      level = "Beginner";
      emoji = "🌱";
      message = "You've started your cybersecurity journey. Review explanations and try again!";
    } else if (percent < 80) {
      level = "Intermediate";
      emoji = "📘";
      message = "Nice work! You have a solid grasp of the basics.";
    } else {
      level = "Pro";
      emoji = "🛡️";
      message = "Excellent! You show strong cybersecurity awareness.";
    }

    // Save stats to localStorage
    recordQuizResult(percent);
    updateQuizStats();

    quizContainer.innerHTML = `
      <div class="quiz-result">
        <h3>Quiz Complete</h3>
        <p>Your Score: <strong>${score}/${total}</strong> (${percent}%)</p>

        <div class="quiz-level">
          <span>${emoji}</span>
          <span>${level} Level</span>
        </div>

        <p style="margin-top:6px;">${message}</p>

        <button id="retryQuiz" type="button" class="btn-primary" style="margin-top:10px;">
          Retake Quiz
        </button>
      </div>
    `;
  }

  function updateQuizStats() {
    if (!statsEl) return;

    const attempts = Number(localStorage.getItem("quizAttempts") || 0);
    const best = Number(localStorage.getItem("quizBestScore") || 0);
    const totalScore = Number(localStorage.getItem("quizTotalScore") || 0);
    const bestStreak = Number(localStorage.getItem("quizBestStreak") || 0);

    const avg = attempts ? Math.round(totalScore / attempts) : 0;

    statsEl.textContent = attempts
      ? `Attempts: ${attempts} • Best: ${best}% • Avg: ${avg}% • Best streak: ${bestStreak} pass(es)`
      : "No quiz attempts yet. Take the quiz to see your stats.";
  }

  function recordQuizResult(percent) {
    const attempts = Number(localStorage.getItem("quizAttempts") || 0) + 1;
    const best = Number(localStorage.getItem("quizBestScore") || 0);
    const totalScore = Number(localStorage.getItem("quizTotalScore") || 0) + percent;

    let currentStreak = Number(localStorage.getItem("quizCurrentStreak") || 0);
    let bestStreak = Number(localStorage.getItem("quizBestStreak") || 0);

    // Consider a "pass" at >= 60%
    if (percent >= 60) {
      currentStreak += 1;
      if (currentStreak > bestStreak) bestStreak = currentStreak;
    } else {
      currentStreak = 0;
    }

    localStorage.setItem("quizAttempts", attempts);
    localStorage.setItem("quizBestScore", Math.max(best, percent));
    localStorage.setItem("quizTotalScore", totalScore);
    localStorage.setItem("quizCurrentStreak", currentStreak);
    localStorage.setItem("quizBestStreak", bestStreak);
  }
}

/* ====== HELPERS ====== */
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m])
  );
}

// Tiny beep for correct/wrong
function playTone(frequency) {
  try {
    initAudio();
    const ctx = globalAudioCtx;
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = frequency;
    osc.type = "sine";
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.start(now);
    osc.stop(now + 0.2);
  } catch {
    // ignore
  }
}

function celebratePerfectScore() {
  if (typeof confetti !== "function") return;
  let duration = 3 * 1000;
  let end = Date.now() + duration;

  (function frame() {
    confetti({
      particleCount: 7,
      angle: 60,
      spread: 70,
      origin: { x: 0 }
    });

    confetti({
      particleCount: 7,
      angle: 120,
      spread: 70,
      origin: { x: 1 }
    });

    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  })();
}

function playCelebrationSound() {
  try {
    initAudio();
    const ctx = globalAudioCtx;
    if (!ctx) return;
    const now = ctx.currentTime;

    // CHIME (C–E–G)
    [523, 659, 784].forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();

      o.type = "sine";
      o.frequency.value = freq;

      o.connect(g);
      g.connect(ctx.destination);

      const start = now + i * 0.15;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.linearRampToValueAtTime(0.3, start + 0.1);
      g.gain.linearRampToValueAtTime(0.0001, start + 0.6);

      o.start(start);
      o.stop(start + 0.6);
    });

    // SPARKLES
    for (let i = 0; i < 5; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();

      o.type = "triangle";
      o.frequency.value = 1000 + i * 200;

      o.connect(g);
      g.connect(ctx.destination);

      const t = now + 0.5 + i * 0.05;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.2, t + 0.05);
      g.gain.linearRampToValueAtTime(0.0001, t + 0.3);

      o.start(t);
      o.stop(t + 0.3);
    }
  } catch {
    // ignore
  }
}

function showMasterBadge() {
  const popup = document.getElementById("badgePopup");
  const closeBtn = document.getElementById("closeBadge");
  if (!popup || !closeBtn) return;

  popup.classList.add("show");

  closeBtn.onclick = () => {
    popup.classList.remove("show");
  };
}
