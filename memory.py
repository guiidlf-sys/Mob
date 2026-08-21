"""Persistent conversation memory for Jarvis, backed by a JSON file."""
import json
import os

DEFAULT_MAX_HISTORY = 40


class Memory:
    def __init__(self, path, max_history=DEFAULT_MAX_HISTORY):
        self.path = path
        self.max_history = max_history
        self.history = self._load()

    def _load(self):
        if not os.path.exists(self.path):
            return []
        with open(self.path, "r", encoding="utf-8") as f:
            try:
                data = json.load(f)
            except json.JSONDecodeError:
                return []
        if not isinstance(data, list):
            return []
        return data[-self.max_history:]

    def append(self, role, content):
        self.history.append({"role": role, "content": content})
        self.history = self.history[-self.max_history:]

    def save(self):
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump(self.history, f, indent=2)

    def as_messages(self):
        return list(self.history)
