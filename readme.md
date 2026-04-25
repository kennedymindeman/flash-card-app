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
  { "prompt": "what does HTTP stand for", "response": "hypertext transfer protocol" },
  { "prompt": "default SSH port", "response": "22" }
]
```

### Card dependencies with `requires`

Use the `requires` field (an array of prompt strings) to declare that a card should only enter the study pool after its prerequisites have graduated to SRS. This is the recommended way to create forward/reverse card pairs:

```json
[
  { "prompt": "hello", "response": "안녕하세요" },
  { "prompt": "안녕하세요", "response": "hello", "requires": ["hello"] }
]
```

The first card (recognition: English → Korean) has no requirements and is eligible immediately. The second card (production: Korean → English) waits until `"hello"` has graduated to SRS before appearing. This ensures you can recognise a word before you're asked to produce it.

A card may depend on multiple prerequisites:

```json
{ "prompt": "greet and introduce", "response": "...", "requires": ["hello", "my name is"] }
```

**Validation.** The server rejects a deck at load time if `requires` references a prompt that doesn't exist in the deck, or if the dependency graph contains a cycle. A clear error is shown rather than failing silently.

### Prompt tags

You can add hashtag-style tags to a prompt to disambiguate cards that share the same base text. Tags are space-separated tokens that start with `#`; they are stripped from the displayed prompt and shown as small muted labels underneath.

```json
[
  { "prompt": "일 #sino",  "response": "1" },
  { "prompt": "일 #day",   "response": "day of the month" }
]
```

The first card displays **일** with a small "sino" label; the second displays **일** with a "day" label. Both are distinct cards because the full prompt string (including the `#` token) is the card's unique identifier — state keys, `requires` references, and validation all use the raw unparsed prompt.

Tags are purely a display concern. Cards without any `#` tokens render exactly as before. Old-style parenthetical hints like `일 (Sino)` still work — they just display with the parentheses visible.

### Hangul fuzzy matching

When the expected answer contains Hangul, the app decomposes both the input and the answer into jamo (Unicode NFD) and computes Levenshtein distance at the jamo level. If the distance is exactly 1 and that single edit represents less than 25% of the answer's total jamo count, the attempt is treated as a **near-miss**: you'll see an "almost — try again" prompt without losing your streak. Completely wrong answers still reset the streak as usual.

### Writing good cards

**Type the exact response.** Matching is case-insensitive but otherwise exact (except for the Hangul fuzzy matching described above). Avoid answers with multiple reasonable phrasings; pick one form and stick to it.

**Keep responses short.** Aim for under 5 words. Long answers are hard to type exactly and slow to recall.

**One fact per card.** If a card is testing two things, split it into two cards.

**Prefer formulas and abbreviations over prose.**

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

Cards with `requires` dependencies only enter the pool once all their prerequisites have graduated to SRS.

### SRS phase
Graduated cards are scheduled using SM-2. Response time influences the next interval — fast correct answers get longer intervals than slow ones. Due cards appear in your session alongside acquisition cards.

## Migrating from `reversible: true`

The `reversible` flag is no longer supported. If your deck used `reversible: true`:

1. Remove the `reversible` field from each card.
2. Add an explicit reverse card with `requires` pointing at the forward card's prompt.

Before:
```json
[
  { "prompt": "hello", "response": "안녕하세요", "reversible": true }
]
```

After:
```json
[
  { "prompt": "hello", "response": "안녕하세요" },
  { "prompt": "안녕하세요", "response": "hello", "requires": ["hello"] }
]
```

Existing state files from before this change may reference auto-generated reversed prompts that no longer exist. Delete the deck's state file from `state/` to start fresh, or manually edit it to remove stale entries.

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