# Flashcard App

A minimalist spaced repetition flashcard app with two study phases: acquisition (building initial recall) and SRS (long-term retention via SM-2 scheduling).

## Setup

```bash
pip3 install flask
python3 server.py
```

Then open `http://localhost:8000`.

## Adding Decks

Create a `.json` file in the `decks/` directory. It will appear in the deck picker automatically.

```json
[
  { "prompt": "time complexity of binary search", "response": "O(log n)" },
  { "prompt": "what does HTTP stand for", "response": "hypertext transfer protocol" }
]
```

### Reversible cards

Add `"reversible": true` to any card to generate a second card with prompt and response swapped. Both directions are tracked independently in the SRS.

```json
[
  { "prompt": "hello", "response": "안녕하세요", "reversible": true }
]
```

This creates two cards: `hello → 안녕하세요` and `안녕하세요 → hello`. Avoid adding a reversed card manually if you're already using `reversible` on the same entry -- they'd share the same state key and conflict.

### Writing good cards

**Type the exact response.** Matching is case-insensitive but otherwise exact -- "O(log n)" and "o(log n)" both pass, but "log n" does not. Avoid answers with multiple reasonable phrasings; pick one form and stick to it.

**Keep responses short.** Aim for under 5 words. Long answers are hard to type exactly and slow to recall.

**One fact per card.** If a card is testing two things, split it into two cards.

**Prefer formulas and abbreviations over prose.** Instead of asking for Newton's second law in words, ask for the formula (`F = ma`). It's shorter, unambiguous, and faster to recall.

**Bad:**
```json
{ "prompt": "what is Newton's second law?", "response": "the acceleration of an object is directly proportional to the net force acting on it and inversely proportional to its mass" }
```

**Good:**
```json
{ "prompt": "formula for Newton's second law", "response": "F = ma" }
```

## How It Works

### Acquisition phase
New cards enter a pool of up to 5 at a time. Answer a card correctly 3 times in a row and it graduates to SRS. A wrong answer resets the streak. You must type the correct answer before moving on.

### SRS phase
Graduated cards are scheduled using SM-2. Response time influences the next interval -- fast correct answers get longer intervals than slow ones. Due cards appear in your session alongside acquisition cards.

## File Structure

```
flashcard-app/
  server.py
  decks/        ← you edit these
  state/        ← app writes these, don't edit
  static/
    index.html
    study.html
    styles.css
    theme.js
    study.js
```

State files are created automatically the first time you study a deck. To reset progress for a deck, delete its file from `state/`. To reset a single card, open the state file and delete the entry matching that card's prompt.
