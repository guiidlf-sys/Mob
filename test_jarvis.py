import json
import os
import tempfile
import unittest
import urllib.error
from unittest import mock

import jarvis
from memory import Memory


class FakeResponse:
    """Minimal stand-in for the object urllib.request.urlopen returns."""

    def __init__(self, payload):
        self._body = json.dumps(payload).encode("utf-8")

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *exc_info):
        return False


class TestSafeEval(unittest.TestCase):
    def test_basic_arithmetic(self):
        self.assertEqual(jarvis.safe_eval("2 + 3 * 4"), 14)
        self.assertEqual(jarvis.safe_eval("(2 + 3) * 4"), 20)
        self.assertEqual(jarvis.safe_eval("10 / 4"), 2.5)
        self.assertEqual(jarvis.safe_eval("-5 + 2"), -3)

    def test_rejects_function_calls(self):
        with self.assertRaises(ValueError):
            jarvis.safe_eval("__import__('os').system('echo hi')")

    def test_rejects_names(self):
        with self.assertRaises(ValueError):
            jarvis.safe_eval("os.getcwd()")

    def test_rejects_non_numeric_constants(self):
        with self.assertRaises(ValueError):
            jarvis.safe_eval("'hello'")

    def test_rejects_garbage_syntax(self):
        with self.assertRaises(ValueError):
            jarvis.safe_eval("2 +")


class TestMaybeRunTool(unittest.TestCase):
    def test_runs_calc_marker(self):
        reply = jarvis.maybe_run_tool("Sure, CALC(6 * 7) is the answer.")
        self.assertIn("[calculator] 6 * 7 = 42", reply)

    def test_no_marker_passthrough(self):
        reply = jarvis.maybe_run_tool("Just chatting, no tools needed.")
        self.assertEqual(reply, "Just chatting, no tools needed.")

    def test_invalid_expression_reports_tool_error(self):
        reply = jarvis.maybe_run_tool("CALC(import os)")
        self.assertIn("[tool error:", reply)


class TestCallOllama(unittest.TestCase):
    def test_success_returns_message_content(self):
        fake = FakeResponse({"message": {"role": "assistant", "content": "hi!"}})
        with mock.patch("jarvis.urllib.request.urlopen", return_value=fake):
            result = jarvis.call_ollama([{"role": "user", "content": "hey"}])
        self.assertEqual(result, "hi!")

    def test_connection_failure_raises_ollama_unavailable(self):
        with mock.patch(
            "jarvis.urllib.request.urlopen",
            side_effect=urllib.error.URLError("connection refused"),
        ):
            with self.assertRaises(jarvis.OllamaUnavailableError):
                jarvis.call_ollama([{"role": "user", "content": "hey"}])

    def test_unexpected_shape_raises_ollama_unavailable(self):
        fake = FakeResponse({"unexpected": "shape"})
        with mock.patch("jarvis.urllib.request.urlopen", return_value=fake):
            with self.assertRaises(jarvis.OllamaUnavailableError):
                jarvis.call_ollama([{"role": "user", "content": "hey"}])


class TestChatTurn(unittest.TestCase):
    def setUp(self):
        fd, self.path = tempfile.mkstemp(suffix=".json")
        os.close(fd)
        os.remove(self.path)
        self.addCleanup(lambda: os.path.exists(self.path) and os.remove(self.path))
        self.memory = Memory(self.path)

    def test_successful_turn_updates_memory(self):
        fake = FakeResponse({"message": {"content": "Hello human!"}})
        with mock.patch("jarvis.urllib.request.urlopen", return_value=fake):
            reply = jarvis.chat_turn(self.memory, "hi jarvis")
        self.assertEqual(reply, "Hello human!")
        self.assertEqual(
            [m["role"] for m in self.memory.as_messages()], ["user", "assistant"]
        )

    def test_offline_degrades_instead_of_crashing(self):
        with mock.patch(
            "jarvis.urllib.request.urlopen",
            side_effect=urllib.error.URLError("connection refused"),
        ):
            reply = jarvis.chat_turn(self.memory, "hi jarvis")
        self.assertIn("Jarvis is offline", reply)
        self.assertEqual(
            [m["role"] for m in self.memory.as_messages()], ["user", "assistant"]
        )


if __name__ == "__main__":
    unittest.main()
