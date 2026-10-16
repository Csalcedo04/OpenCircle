#!/usr/bin/env python3
"""UserPromptSubmit hook: append every user prompt to AI_USAGE.md under '## Prompt Log'.

Never blocks the prompt: any failure is swallowed and exits 0.
"""
import json
import os
import re
import sys
from datetime import datetime

HEADING = "## Prompt Log"

# Light redaction so obvious secrets never land in a versioned file.
REDACTIONS = [
    (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----", re.S), "[REDACTED PRIVATE KEY]"),
    (re.compile(r"\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{8,}"), "[REDACTED KEY]"),
    (re.compile(r"\b(gh[pousr]_[A-Za-z0-9]{20,})"), "[REDACTED TOKEN]"),
    (re.compile(r"(?i)\b(secret|password|passwd|token|api[_-]?key)\s*[:=]\s*\S+"), r"\1=[REDACTED]"),
]


def redact(text: str) -> str:
    for pattern, repl in REDACTIONS:
        text = pattern.sub(repl, text)
    return text


def main() -> None:
    data = json.load(sys.stdin)
    prompt = (data.get("prompt") or "").strip()
    if not prompt:
        return

    project_dir = os.environ.get("CLAUDE_PROJECT_DIR") or data.get("cwd") or os.getcwd()
    path = os.path.join(project_dir, "AI_USAGE.md")

    content = ""
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            content = f.read()

    stamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    quoted = "\n".join(f"> {line}" if line else ">" for line in redact(prompt).splitlines())
    entry = f"**{stamp} · Claude Code**\n{quoted}\n"

    if HEADING not in content:
        content = content.rstrip("\n") + f"\n\n{HEADING}\n"
    content = content.rstrip("\n") + "\n\n" + entry

    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
    sys.exit(0)
