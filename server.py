import json
import os
import threading
from datetime import date

from flask import Flask, jsonify, request, send_from_directory

app = Flask(__name__)

DECKS_DIR = "decks"
STATE_DIR = "state"

os.makedirs(DECKS_DIR, exist_ok=True)
os.makedirs(STATE_DIR, exist_ok=True)

_state_locks: dict[str, threading.Lock] = {}
_state_locks_lock = threading.Lock()


def get_lock(name: str) -> threading.Lock:
    with _state_locks_lock:
        if name not in _state_locks:
            _state_locks[name] = threading.Lock()
        return _state_locks[name]


def read_deck(name: str) -> list:
    path = os.path.join(DECKS_DIR, f"{name}.json")
    if not os.path.exists(path):
        return []
    with open(path) as f:
        return json.load(f)


def read_state(name: str) -> dict:
    path = os.path.join(STATE_DIR, f"{name}-state.json")
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return {}


def write_state(name: str, state: dict):
    import uuid

    path = os.path.join(STATE_DIR, f"{name}-state.json")
    tmp = path + f".{uuid.uuid4().hex}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)
    os.replace(tmp, path)


def normalize_cards(raw_cards: list) -> list:
    """Shallow-copy each card dict and normalize the requires field."""
    cards = []
    for card in raw_cards:
        c = dict(card)
        requires = c.get("requires")
        if requires is None:
            c["requires"] = []
        elif isinstance(requires, str):
            c["requires"] = [requires]
        cards.append(c)
    return cards


def validate_deck(cards: list) -> str | None:
    """Validate that all requires references exist and there are no cycles.

    Returns an error string if invalid, or None if the deck is valid.
    """
    prompts = {card["prompt"] for card in cards}

    # Check that every requires reference points to an existing prompt
    for card in cards:
        for req in card["requires"]:
            if req not in prompts:
                return f'Card "{card["prompt"]}" requires "{req}" which does not exist in the deck'

    # DFS 3-colour cycle detection
    WHITE, GRAY, BLACK = 0, 1, 2
    color: dict[str, int] = {card["prompt"]: WHITE for card in cards}
    adj: dict[str, list[str]] = {card["prompt"]: card["requires"] for card in cards}

    def dfs(node: str, path: list[str]) -> str | None:
        color[node] = GRAY
        path.append(node)
        for neighbor in adj[node]:
            if color[neighbor] == GRAY:
                cycle_start = path.index(neighbor)
                cycle = path[cycle_start:] + [neighbor]
                return "Dependency cycle: " + " → ".join(cycle)
            if color[neighbor] == WHITE:
                result = dfs(neighbor, path)
                if result is not None:
                    return result
        path.pop()
        color[node] = BLACK
        return None

    for card in cards:
        if color[card["prompt"]] == WHITE:
            result = dfs(card["prompt"], [])
            if result is not None:
                return result

    return None


def deck_summary(name: str) -> dict:
    cards = normalize_cards(read_deck(name))
    err = validate_deck(cards)
    if err is not None:
        return {
            "name": name,
            "total": len(cards),
            "due": 0,
            "acquiring": 0,
            "error": err,
        }

    state = read_state(name)
    today = date.today().isoformat()

    total = len(cards)
    due = sum(
        1
        for card in cards
        if (s := state.get(card["prompt"]))
        and s.get("phase") == "srs"
        and s.get("dueDate", "") <= today
    )
    acquiring = sum(
        1
        for card in cards
        if not state.get(card["prompt"])
        or state.get(card["prompt"], {}).get("phase") == "acquisition"
    )

    return {
        "name": name,
        "total": total,
        "due": due,
        "acquiring": acquiring,
    }


# --- Static files ---


@app.route("/")
def index():
    return send_from_directory("static", "index.html")


@app.route("/study/<name>")
def study(name):
    return send_from_directory("static", "study.html")


@app.route("/static/<path:path>")
def static_files(path):
    return send_from_directory("static", path)


# --- API ---


@app.route("/api/decks")
def get_decks():
    names = [f[:-5] for f in os.listdir(DECKS_DIR) if f.endswith(".json")]
    return jsonify([deck_summary(name) for name in sorted(names)])


@app.route("/api/deck/<name>")
def get_deck(name):
    cards = normalize_cards(read_deck(name))
    err = validate_deck(cards)
    if err is not None:
        return jsonify({"error": err}), 400
    state = read_state(name)
    return jsonify({"cards": cards, "state": state})


@app.route("/api/deck/<name>/state", methods=["POST"])
def update_state(name):
    update = request.get_json()
    with get_lock(name):
        state = read_state(name)
        state[update["prompt"]] = update["state"]
        write_state(name, state)
    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(debug=True, port=8000)
