import json
import os
import tempfile
import unittest

from memory import Memory


class TestMemory(unittest.TestCase):
    def setUp(self):
        fd, self.path = tempfile.mkstemp(suffix=".json")
        os.close(fd)
        os.remove(self.path)  # start from "file does not exist yet"
        self.addCleanup(lambda: os.path.exists(self.path) and os.remove(self.path))

    def test_load_missing_file_returns_empty(self):
        memory = Memory(self.path)
        self.assertEqual(memory.as_messages(), [])

    def test_append_and_save_round_trip(self):
        memory = Memory(self.path)
        memory.append("user", "hello")
        memory.append("assistant", "hi there")
        memory.save()

        reloaded = Memory(self.path)
        self.assertEqual(
            reloaded.as_messages(),
            [
                {"role": "user", "content": "hello"},
                {"role": "assistant", "content": "hi there"},
            ],
        )

    def test_history_trims_to_max(self):
        memory = Memory(self.path, max_history=3)
        for i in range(5):
            memory.append("user", str(i))
        self.assertEqual(
            [m["content"] for m in memory.as_messages()], ["2", "3", "4"]
        )

    def test_corrupted_file_degrades_to_empty(self):
        with open(self.path, "w", encoding="utf-8") as f:
            f.write("{not valid json")
        memory = Memory(self.path)
        self.assertEqual(memory.as_messages(), [])

    def test_non_list_json_degrades_to_empty(self):
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump({"unexpected": "shape"}, f)
        memory = Memory(self.path)
        self.assertEqual(memory.as_messages(), [])

    def test_as_messages_returns_a_copy(self):
        memory = Memory(self.path)
        memory.append("user", "hello")
        snapshot = memory.as_messages()
        snapshot.append({"role": "user", "content": "mutated"})
        self.assertEqual(len(memory.as_messages()), 1)


if __name__ == "__main__":
    unittest.main()
