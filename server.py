import json
import os
from datetime import date

from flask import Flask, jsonify, request, send_from_directory

app = Flask(__name__)

DECKS_DIR = "decks"
STATE_DIR = "state"

os.makedirs(DECKS_DIR, exist_ok=True)
os.makedirs(STATE_DIR, exist_ok=True)


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
    with open(path) as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return {}


def write_state(name: str, state: dict):
    path = os.path.join(STATE_DIR, f"{name}-state.json")
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(state, f, indent=2)
    os.replace(tmp, path)


def deck_summary(name: str) -> dict:
    cards = read_deck(name)
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
    cards = read_deck(name)
    state = read_state(name)
    return jsonify({"cards": cards, "state": state})


@app.route("/api/deck/<name>/state", methods=["POST"])
def update_state(name):
    state = read_state(name)
    update = request.get_json()
    state[update["prompt"]] = update["state"]
    write_state(name, state)
    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(debug=True, port=8000)
