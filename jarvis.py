"""Jarvis: a local CLI assistant backed by an Ollama server.

Uses stdlib urllib (no third-party HTTP dependency) so there is no
external library signature to drift out from under this code.
"""
import ast
import json
import operator
import os
import urllib.error
import urllib.request

from memory import Memory

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434/api/chat")
MODEL = os.environ.get("JARVIS_MODEL", "llama3")
MEMORY_PATH = os.environ.get(
    "JARVIS_MEMORY_PATH", os.path.join(os.path.dirname(__file__), "memory.json")
)

SYSTEM_PROMPT = {
    "role": "system",
    "content": (
        "You are Jarvis, a helpful local assistant. "
        "When the user asks for arithmetic, respond with CALC(<expression>) "
        "so the calculator tool can compute it."
    ),
}


class OllamaUnavailableError(RuntimeError):
    """Raised when the local Ollama server cannot be reached or replies oddly."""


_ALLOWED_OPERATORS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
    ast.Mod: operator.mod,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}


def safe_eval(expression):
    """Evaluate a numeric expression without falling back to eval()."""
    try:
        node = ast.parse(expression, mode="eval").body
    except SyntaxError as exc:
        raise ValueError(f"invalid expression: {expression!r}") from exc
    return _eval_node(node)


def _eval_node(node):
    if isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float)) and not isinstance(node.value, bool):
            return node.value
        raise ValueError(f"unsupported constant: {node.value!r}")
    if isinstance(node, ast.BinOp) and type(node.op) in _ALLOWED_OPERATORS:
        return _ALLOWED_OPERATORS[type(node.op)](
            _eval_node(node.left), _eval_node(node.right)
        )
    if isinstance(node, ast.UnaryOp) and type(node.op) in _ALLOWED_OPERATORS:
        return _ALLOWED_OPERATORS[type(node.op)](_eval_node(node.operand))
    raise ValueError(f"unsupported expression: {ast.dump(node)}")


def call_ollama(messages, model=MODEL, url=OLLAMA_URL, timeout=30):
    payload = json.dumps(
        {"model": model, "messages": messages, "stream": False}
    ).encode("utf-8")
    request = urllib.request.Request(
        url, data=payload, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = json.load(response)
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise OllamaUnavailableError(f"could not reach Ollama at {url}: {exc}") from exc
    try:
        return body["message"]["content"]
    except (KeyError, TypeError) as exc:
        raise OllamaUnavailableError(f"unexpected Ollama response shape: {body!r}") from exc


def maybe_run_tool(reply):
    """Detect a CALC(...) tool call in the model's reply and run it safely."""
    marker = "CALC("
    start = reply.find(marker)
    if start == -1:
        return reply
    end = reply.find(")", start)
    if end == -1:
        return reply
    expression = reply[start + len(marker):end]
    try:
        result = safe_eval(expression)
    except ValueError as exc:
        return f"{reply}\n[tool error: {exc}]"
    return f"{reply}\n[calculator] {expression} = {result}"


def chat_turn(memory, user_input, model=MODEL, url=OLLAMA_URL):
    """Run one turn: update memory, call the model, run any tool, update memory again."""
    memory.append("user", user_input)
    messages = [SYSTEM_PROMPT] + memory.as_messages()
    try:
        reply = call_ollama(messages, model=model, url=url)
    except OllamaUnavailableError as exc:
        reply = f"[Jarvis is offline: {exc}]"
        memory.append("assistant", reply)
        return reply
    reply = maybe_run_tool(reply)
    memory.append("assistant", reply)
    return reply


def main():
    memory = Memory(MEMORY_PATH)
    print("Jarvis ready. Type 'exit' to quit.")
    try:
        while True:
            user_input = input("> ").strip()
            if user_input.lower() in {"exit", "quit"}:
                break
            if not user_input:
                continue
            reply = chat_turn(memory, user_input)
            print(reply)
            memory.save()
    except (KeyboardInterrupt, EOFError):
        print()
    finally:
        memory.save()


if __name__ == "__main__":
    main()
