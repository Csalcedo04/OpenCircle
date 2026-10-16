#!/usr/bin/env python3
"""PostToolUse hook: tracks code edits and verification runs per session.

Ported from .agents/hooks/track-verification.py. State lives in
.claude/state/session-<id>.json and is read by done-gate.py.
"""

import json
import os
import re
import sys

STATE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "state")

CODE_PATHS = [r"/src/", r"/app/", r"/tests?/", r"/infra/", r"/package\.json$", r"\.(ts|tsx|mts|cts)$"]
TYPECHECK = [r"\btsc\b.*--noEmit\b", r"\btypecheck\b", r"\btype-check\b"]
TESTS = [r"\bvitest\b", r"\bjest\b", r"\bplaywright\s+test\b", r"(npm|pnpm|yarn|bun)\s+(run\s+)?test\b"]


def session_file(session_id):
    safe = re.sub(r"[^a-zA-Z0-9_\-]", "_", session_id or "default")
    return os.path.join(STATE_DIR, f"session-{safe}.json")


def load(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"dirty": False, "typecheck_ok": False, "tests_ok": False, "continues": 0}


def save(path, state):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)


def main():
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        tool_name = payload.get("tool_name", "")
        tool_input = payload.get("tool_input") or {}
        path = session_file(payload.get("session_id"))
        state = load(path)

        if tool_name in ("Write", "Edit", "MultiEdit"):
            target = os.path.abspath(tool_input.get("file_path", "")).replace("\\", "/")
            if "/.claude/" not in target and any(re.search(p, target) for p in CODE_PATHS):
                state.update(dirty=True, typecheck_ok=False, tests_ok=False, continues=0)
        elif tool_name == "Bash":
            response = payload.get("tool_response") or {}
            failed = isinstance(response, dict) and (response.get("interrupted") or response.get("is_error"))
            cmd = tool_input.get("command", "")
            if not failed:
                if any(re.search(p, cmd) for p in TYPECHECK):
                    state["typecheck_ok"] = True
                if any(re.search(p, cmd) for p in TESTS):
                    state["tests_ok"] = True
        save(path, state)
    except Exception:
        pass


if __name__ == "__main__":
    main()
