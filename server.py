import json
import os

from flask import Flask, jsonify, request, send_from_directory

app = Flask(__name__)

DATA_FILE = "data.json"


def read_data():
    if not os.path.exists(DATA_FILE):
        return {}
    with open(DATA_FILE, "r") as f:
        return json.load(f)


def write_data(data):
    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=2)


# Serve static files
@app.route("/")
def index():
    return send_from_directory(".", "index.html")


@app.route("/<path:path>")
def static_files(path):
    return send_from_directory(".", path)


# Data endpoints
@app.route("/api/state", methods=["GET"])
def get_state():
    return jsonify(read_data())


@app.route("/api/state", methods=["POST"])
def set_state():
    write_data(request.get_json())
    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(debug=True, port=8000)
