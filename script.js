let flashcards = [];
let currentIndex = 0;
let showingFront = true;

// Load flashcards from JSON file
async function loadFlashcards() {
  try {
    const response = await fetch("flashcards.json");
    flashcards = await response.json();
    currentIndex = 0;
    showingFront = true;
    displayCard();
    updateCounter();
  } catch (error) {
    document.getElementById("card-content").textContent =
      "Error loading flashcards. Make sure flashcards.json exists.";
  }
}

function displayCard() {
  if (flashcards.length === 0) return;

  const card = flashcards[currentIndex];
  const content = showingFront ? card.front : card.back;
  document.getElementById("card-content").textContent = content;
}

function flipCard() {
  if (flashcards.length === 0) {
    loadFlashcards();
    return;
  }

  showingFront = !showingFront;
  displayCard();
}

function nextCard() {
  if (flashcards.length === 0) return;

  currentIndex = (currentIndex + 1) % flashcards.length;
  showingFront = true;
  displayCard();
  updateCounter();
}

function prevCard() {
  if (flashcards.length === 0) return;

  currentIndex = currentIndex === 0 ? flashcards.length - 1 : currentIndex - 1;
  showingFront = true;
  displayCard();
  updateCounter();
}

function updateCounter() {
  document.getElementById("counter").textContent =
    `${currentIndex + 1} / ${flashcards.length}`;
}

// Load flashcards when page loads
loadFlashcards();
