#!/usr/bin/env python3
"""Stop hook: Definition of Done gate.

Ported from .agents/hooks/done-gate.py. If code changed this session and
`tsc --noEmit` or the test suite has not run since, blocks the stop (at most
twice per change) and tells Claude what is missing.
"""

import json
import os
import re
import sys

STATE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "state")


def session_file(session_id):
    safe = re.sub(r"[^a-zA-Z0-9_\-]", "_", session_id or "default")
    return os.path.join(STATE_DIR, f"session-{safe}.json")


def main():
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        path = session_file(payload.get("session_id"))
        if not os.path.exists(path):
            return
        with open(path, encoding="utf-8") as f:
            state = json.load(f)
        if not state.get("dirty"):
            return

        missing = []
        if not state.get("typecheck_ok"):
            missing.append("verificación de tipos ('tsc --noEmit')")
        if not state.get("tests_ok"):
            missing.append("suite de pruebas ('npm test' o 'playwright test')")
        if not missing or state.get("continues", 0) >= 2:
            return

        state["continues"] = state.get("continues", 0) + 1
        with open(path, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2)
        reason = (
            f"Definition of Done incompleto tras cambios en código: falta {' y '.join(missing)}. "
            "Ejecuta la verificación antes de terminar, o explica al usuario por qué no aplica "
            "(por ejemplo, el proyecto aún no tiene package.json o tests)."
        )
        sys.stdout.write(json.dumps({"decision": "block", "reason": reason}) + "\n")
    except Exception:
        pass


if __name__ == "__main__":
    main()
