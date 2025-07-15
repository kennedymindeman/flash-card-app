class FlashCardQuiz {
  constructor() {
    this.config = {
      timeLimit: 30,
      timePerChar: 0.5,
      masteryRequirement: 5,
      initialCards: 5,
    };

    this.cards = [];
    this.cardsInPlay = [];
    this.masteredCards = [];
    this.currentCardIndex = 0;
    this.currentCard = null;
    this.timer = null;
    this.timeRemaining = 0;
    this.isPaused = false;
    this.totalAttempts = 0;
    this.correctAttempts = 0;
    this.gameState = "start"; // 'start', 'playing', 'paused', 'finished'

    this.initializeElements();
    this.loadConfiguration();
    this.loadCards();
    this.setupEventListeners();
    this.updateStartScreen();
  }

  initializeElements() {
    this.startScreen = document.getElementById("start-screen");
    this.quizScreen = document.getElementById("quiz-screen");
    this.finishedScreen = document.getElementById("finished-screen");
    this.timerElement = document.getElementById("timer");
    this.promptElement = document.getElementById("prompt");
    this.answerInput = document.getElementById("answer-input");
    this.feedbackElement = document.getElementById("feedback");
    this.nextBtn = document.getElementById("next-btn");
    this.resetBtn = document.getElementById("reset-btn");
    this.progressFill = document.getElementById("progress-fill");
    this.cardInfo = document.getElementById("card-info");

    // Stats elements
    this.percentCorrectElement = document.getElementById("percent-correct");
    this.cardsMasteredElement = document.getElementById("cards-mastered");
    this.cardsInPlayElement = document.getElementById("cards-in-play");
    this.totalCardsElement = document.getElementById("total-cards");
    this.masteryRequirementElement = document.getElementById(
      "mastery-requirement",
    );
    this.initialCardsElement = document.getElementById("initial-cards");
    this.finalPercentElement = document.getElementById("final-percent");
    this.finalMasteredElement = document.getElementById("final-mastered");
  }

  loadConfiguration() {
    // In a real implementation, this would load from config.json
    // For now, using default values
    try {
      // Simulate loading config.json
      const defaultConfig = {
        timeLimit: 30,
        timePerChar: 0.5,
        masteryRequirement: 5,
        initialCards: 5,
      };
      this.config = { ...defaultConfig };
      console.log("Configuration loaded:", this.config);
    } catch (error) {
      console.error("Error loading configuration, using defaults:", error);
    }
  }

  async loadCards() {
    try {
      // Load cards from cards.json
      const response = await fetch("cards.json");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      this.cards = await response.json();

      // Initialize card tracking
      this.cards.forEach((card) => {
        card.consecutiveCorrect = 0;
        card.totalAttempts = 0;
        card.correctAttempts = 0;
      });

      console.log("Cards loaded:", this.cards.length);
    } catch (error) {
      console.error("Error loading cards:", error);
      // Fallback to empty array if loading fails
      this.cards = [];
      alert(
        "Error loading flash cards. Please make sure cards.json is available.",
      );
    }
  }

  setupEventListeners() {
    // Global key listener for Enter key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        this.handleEnterKey();
      }
    });

    // Answer input listener
    this.answerInput.addEventListener("input", (e) => {
      if (this.gameState === "playing" && !this.isPaused) {
        // Auto-submit could be added here if desired
      }
    });

    // Button listeners
    this.nextBtn.addEventListener("click", () => {
      this.nextCard();
    });

    this.resetBtn.addEventListener("click", () => {
      this.resetGame();
    });
  }

  handleEnterKey() {
    switch (this.gameState) {
      case "start":
        this.startQuiz();
        break;
      case "playing":
        if (!this.isPaused) {
          this.submitAnswer();
        }
        break;
      case "paused":
        this.nextCard();
        break;
      case "finished":
        this.resetGame();
        break;
    }
  }

  updateStartScreen() {
    this.totalCardsElement.textContent = this.cards.length;
    this.masteryRequirementElement.textContent = this.config.masteryRequirement;
    this.initialCardsElement.textContent = Math.min(
      this.config.initialCards,
      this.cards.length,
    );
  }

  startQuiz() {
    this.gameState = "playing";
    this.showScreen("quiz");
    this.initializeRound();
    this.displayCurrentCard();
  }

  initializeRound() {
    // Shuffle all cards
    this.shuffleArray(this.cards);

    // Select initial cards
    const availableCards = this.cards.filter(
      (card) => card.consecutiveCorrect < this.config.masteryRequirement,
    );
    this.cardsInPlay = availableCards.slice(
      0,
      Math.min(this.config.initialCards, availableCards.length),
    );

    // Shuffle cards in play
    this.shuffleArray(this.cardsInPlay);

    this.currentCardIndex = 0;
    this.updateStats();
    this.updateProgress();
  }

  displayCurrentCard() {
    if (this.currentCardIndex >= this.cardsInPlay.length) {
      this.checkRoundComplete();
      return;
    }

    this.currentCard = this.cardsInPlay[this.currentCardIndex];
    this.promptElement.textContent = this.currentCard.prompt;
    this.answerInput.value = "";
    this.answerInput.disabled = false;
    this.answerInput.focus();

    // Calculate time limit
    const flatTime = this.config.timeLimit;
    const charTime = this.currentCard.prompt.length * this.config.timePerChar;
    this.timeRemaining = Math.max(flatTime, charTime);

    this.hideFeedback();
    this.updateCardInfo();
    this.startTimer();
  }

  startTimer() {
    this.clearTimer();
    this.updateTimerDisplay();

    this.timer = setInterval(() => {
      this.timeRemaining--;
      this.updateTimerDisplay();

      if (this.timeRemaining <= 0) {
        this.handleTimeout();
      }
    }, 1000);
  }

  updateTimerDisplay() {
    this.timerElement.textContent = this.timeRemaining;

    // Update timer styling based on remaining time
    const percentage =
      this.timeRemaining /
      Math.max(
        this.config.timeLimit,
        this.currentCard.prompt.length * this.config.timePerChar,
      );

    this.timerElement.classList.remove("warning", "danger");
    if (percentage <= 0.25) {
      this.timerElement.classList.add("danger");
    } else if (percentage <= 0.5) {
      this.timerElement.classList.add("warning");
    }
  }

  clearTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  submitAnswer() {
    if (this.isPaused) return;

    const userAnswer = this.answerInput.value.trim();

    if (userAnswer === "") {
      this.showFeedback("Please enter an answer", "incorrect");
      return;
    }

    this.clearTimer();
    this.currentCard.totalAttempts++;
    this.totalAttempts++;

    const isCorrect = this.checkAnswer(userAnswer, this.currentCard.answers);

    if (isCorrect) {
      this.handleCorrectAnswer();
    } else {
      this.handleIncorrectAnswer();
    }

    this.updateStats();
    this.pauseForFeedback();
  }

  checkAnswer(userAnswer, correctAnswers) {
    const normalizedUserAnswer = userAnswer.toLowerCase().trim();
    return correctAnswers.some(
      (answer) => answer.toLowerCase().trim() === normalizedUserAnswer,
    );
  }

  handleCorrectAnswer() {
    this.currentCard.consecutiveCorrect++;
    this.currentCard.correctAttempts++;
    this.correctAttempts++;

    this.playAudioFeedback("correct");
    this.showFeedback("Correct!", "correct");
    this.addVisualFeedback("pulse");

    if (this.currentCard.consecutiveCorrect >= this.config.masteryRequirement) {
      this.masterCard();
    }
  }

  handleIncorrectAnswer() {
    this.currentCard.consecutiveCorrect = 0;

    this.playAudioFeedback("incorrect");
    const correctAnswer = this.currentCard.answers[0];
    this.showFeedback(
      `Incorrect. The answer is: ${correctAnswer}`,
      "incorrect",
    );
    this.addVisualFeedback("shake");
  }

  handleTimeout() {
    this.clearTimer();
    this.currentCard.totalAttempts++;
    this.totalAttempts++;
    this.currentCard.consecutiveCorrect = 0;

    this.playAudioFeedback("timeout");
    const correctAnswer = this.currentCard.answers[0];
    this.showFeedback(`Time's up! The answer is: ${correctAnswer}`, "timeout");
    this.addVisualFeedback("shake");

    this.updateStats();
    this.pauseForFeedback();
  }

  masterCard() {
    this.masteredCards.push(this.currentCard);
    this.cardsInPlay.splice(this.currentCardIndex, 1);
    this.currentCardIndex--; // Adjust index since we removed a card

    this.showFeedback("Mastered! 🎉", "correct");

    if (this.masteredCards.length === this.cards.length) {
      setTimeout(() => {
        this.finishQuiz();
      }, 2000);
    }
  }

  pauseForFeedback() {
    this.isPaused = true;
    this.answerInput.disabled = true;
    this.gameState = "paused";
    this.nextBtn.classList.remove("hidden");
    this.nextBtn.disabled = false;
  }

  nextCard() {
    this.isPaused = false;
    this.gameState = "playing";
    this.nextBtn.classList.add("hidden");
    this.currentCardIndex++;
    this.displayCurrentCard();
  }

  checkRoundComplete() {
    // Check if we need to add more cards
    const availableCards = this.cards.filter(
      (card) =>
        card.consecutiveCorrect < this.config.masteryRequirement &&
        !this.cardsInPlay.includes(card),
    );

    if (
      this.cardsInPlay.length < this.config.initialCards &&
      availableCards.length > 0
    ) {
      this.cardsInPlay.push(availableCards[0]);
    }

    if (this.cardsInPlay.length === 0) {
      this.finishQuiz();
      return;
    }

    // Shuffle and restart round
    this.shuffleArray(this.cardsInPlay);
    this.currentCardIndex = 0;
    this.updateProgress();
    this.displayCurrentCard();
  }

  finishQuiz() {
    this.gameState = "finished";
    this.clearTimer();

    const finalPercent =
      this.totalAttempts > 0
        ? Math.round((this.correctAttempts / this.totalAttempts) * 100)
        : 0;

    this.finalPercentElement.textContent = `${finalPercent}%`;
    this.finalMasteredElement.textContent = this.masteredCards.length;

    this.showScreen("finished");
  }

  resetGame() {
    this.clearTimer();

    // Reset all card states
    this.cards.forEach((card) => {
      card.consecutiveCorrect = 0;
      card.totalAttempts = 0;
      card.correctAttempts = 0;
    });

    // Reset game state
    this.cardsInPlay = [];
    this.masteredCards = [];
    this.currentCardIndex = 0;
    this.currentCard = null;
    this.totalAttempts = 0;
    this.correctAttempts = 0;
    this.isPaused = false;
    this.gameState = "start";

    this.showScreen("start");
    this.updateStartScreen();
  }

  showScreen(screen) {
    this.startScreen.classList.add("hidden");
    this.quizScreen.classList.add("hidden");
    this.finishedScreen.classList.add("hidden");

    switch (screen) {
      case "start":
        this.startScreen.classList.remove("hidden");
        break;
      case "quiz":
        this.quizScreen.classList.remove("hidden");
        break;
      case "finished":
        this.finishedScreen.classList.remove("hidden");
        break;
    }
  }

  showFeedback(message, type) {
    this.feedbackElement.textContent = message;
    this.feedbackElement.className = `feedback ${type}`;
    this.feedbackElement.classList.remove("hidden");
  }

  hideFeedback() {
    this.feedbackElement.classList.add("hidden");
  }

  updateStats() {
    const percentCorrect =
      this.totalAttempts > 0
        ? Math.round((this.correctAttempts / this.totalAttempts) * 100)
        : 0;

    this.percentCorrectElement.textContent = `${percentCorrect}%`;
    this.cardsMasteredElement.textContent = this.masteredCards.length;
    this.cardsInPlayElement.textContent = this.cardsInPlay.length;
  }

  updateProgress() {
    const progress =
      this.cards.length > 0
        ? (this.masteredCards.length / this.cards.length) * 100
        : 0;
    this.progressFill.style.width = `${progress}%`;
  }

  updateCardInfo() {
    this.cardInfo.textContent = `Card ${this.currentCardIndex + 1} of ${this.cardsInPlay.length}`;
  }

  playAudioFeedback(type) {
    // Simple audio feedback using Web Audio API
    try {
      const audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      let frequency;
      switch (type) {
        case "correct":
          frequency = 800; // High pleasant tone
          break;
        case "incorrect":
          frequency = 200; // Low tone
          break;
        case "timeout":
          frequency = 300; // Medium tone
          break;
      }

      oscillator.frequency.value = frequency;
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.01,
        audioContext.currentTime + 0.1,
      );

      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.1);
    } catch (error) {
      console.log("Audio feedback not available:", error);
    }
  }

  addVisualFeedback(type) {
    this.promptElement.classList.add(type);
    setTimeout(() => {
      this.promptElement.classList.remove(type);
    }, 500);
  }

  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }
}

// Initialize the quiz when the page loads
document.addEventListener("DOMContentLoaded", () => {
  new FlashCardQuiz();
});
