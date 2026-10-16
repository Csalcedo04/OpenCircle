#!/usr/bin/env python3
"""PreToolUse hook: payments guardrails for Claude Code.

Ported from .agents/hooks/payments-guard.py (skills-hackaton-medellin).
Reads the Claude Code hook payload on stdin and, when a rule matches, prints
a PreToolUse permission decision ("deny" or "ask"). No output means the
normal permission flow applies. On an internal error it asks for confirmation.
"""

import json
import os
import re
import sys

WRITE_TOOLS = ("Write", "Edit", "MultiEdit", "NotebookEdit")

BASH_DENY = [
    (r"\brm\s+-[a-zA-Z]*(rf|fr)\b", "Uso de 'rm -rf' prohibido."),
    (r"\bsudo\b", "Uso de 'sudo' prohibido."),
    (r"(curl|wget)\b.*\|\s*(ba|z)?sh\b", "Descargas directas hacia shell prohibidas."),
    (r"git\s+push\s+.*(--force|-f\b)", "Force-push en git prohibido."),
    (r"git\s+reset\s+--hard\b", "'git reset --hard' prohibido."),
    (r"git\s+clean\s+.*-f", "'git clean -f' prohibido."),
    (r"\bdocker\s+run\b", "'docker run' directo prohibido; usa docker compose."),
    (r"docker\b.*--privileged", "Contenedores privileged prohibidos."),
    (r"docker\b.*docker\.sock", "Montar /var/run/docker.sock prohibido."),
    (r"(--net=host|--network=host)\b", "network host prohibido."),
    (r"\bprintenv\b", "'printenv' prohibido (vuelca variables de entorno)."),
    (r"(cat|less|more|head|tail|source|bat)\s+.*\.env(?!\.example\b)", "Lectura de .env por shell prohibida."),
    (r"docker\s+compose\s+down\s+.*(-v\b|--volumes)", "Borrar volúmenes de docker compose prohibido."),
    (r"docker\s+system\s+prune\b", "'docker system prune' prohibido."),
    (r"docker\s+volume\s+rm\b", "'docker volume rm' prohibido."),
    (r"(npm|pnpm|yarn|bun)\s+publish\b", "Publicar paquetes prohibido."),
]

BASH_ASK = [
    (r"git\s+(commit|push)\b", "Operación git (commit/push): requiere aprobación."),
    (r"(npm|pnpm|yarn|bun)\s+(add|install|i)\b", "Instalación de dependencias: audita y fija versión exacta."),
    (r"docker\s+compose\b.*?\b(up|build)\b", "docker compose up/build: requiere aprobación."),
    (r"(prisma\s+migrate|db\s+push|drizzle-kit\s+(push|migrate))\b", "Migración de base de datos: requiere aprobación."),
]

PROTECTED_WRITE_PATHS = [
    r"/\.git/",
    r"/\.claude/hooks/",
    r"/\.claude/settings(\.local)?\.json$",
    r"/\.mcp\.json$",
]

DOCS_LIKE = ("/docs/", "/.claude/skills/", "CLAUDE.md", ".env.example")


def deny(reason):
    return {"permissionDecision": "deny", "permissionDecisionReason": reason}


def ask(reason):
    return {"permissionDecision": "ask", "permissionDecisionReason": reason}


def target_paths(tool_input):
    paths = []
    for key in ("file_path", "notebook_path", "path"):
        val = tool_input.get(key)
        if isinstance(val, str) and val:
            paths.append(os.path.abspath(val))
    return paths


def written_content(tool_name, tool_input):
    parts = []
    for key in ("content", "new_string", "new_source"):
        if isinstance(tool_input.get(key), str):
            parts.append(tool_input[key])
    if tool_name == "MultiEdit":
        for edit in tool_input.get("edits") or []:
            if isinstance(edit, dict) and isinstance(edit.get("new_string"), str):
                parts.append(edit["new_string"])
    return "\n".join(parts)


def check_sensitive_path(path):
    base = os.path.basename(path)
    norm = path.replace("\\", "/")
    if base.startswith(".env") and not base.endswith(".example"):
        return deny(f"Acceso denegado a archivo de entorno sensible: {base}")
    if base.startswith("id_rsa") or base.endswith((".pem", ".p12", ".key")):
        return deny(f"Acceso denegado a clave privada o certificado: {base}")
    if "/.ssh/" in norm or "/.aws/" in norm:
        return deny("Acceso denegado a directorio de credenciales (.ssh o .aws).")
    return None


def check_content(content, paths):
    if re.search(r"-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----", content):
        return deny("Se detectó una clave privada PEM en el contenido.")
    if re.search(r"\bAKIA[0-9A-Z]{16}\b", content):
        return deny("Se detectó una AWS Access Key ID.")
    if re.search(r"\bgh[pousr]_[0-9a-zA-Z]{36}\b", content):
        return deny("Se detectó un token de GitHub.")
    if re.search(r"NEXT_PUBLIC_[A-Z0-9_]*(KEY|SECRET|TOKEN|PRIVATE)", content):
        return deny("NEXT_PUBLIC_ no puede exponer KEY, SECRET, TOKEN o PRIVATE al navegador.")
    if re.search(r"ignoreBuildErrors\s*:\s*true", content):
        return deny("'ignoreBuildErrors: true' está prohibido.")
    if re.search(r"""['"]use client['"]""", content) and "@interledger/open-payments" in content:
        return deny("@interledger/open-payments no puede importarse en componentes 'use client'; debe ser server-only.")
    if re.search(r"\bprivileged\s*:\s*true\b", content) or "docker.sock" in content:
        return deny("Contenedor privileged o docker.sock detectado.")
    if re.search(r"network_mode\s*:\s*['\"]?host['\"]?", content):
        return deny("'network_mode: host' detectado.")
    if re.search(r"(?:api[_-]?key|secret[_-]?key)\s*[:=]\s*['\"][A-Za-z0-9_\-]{24,}['\"]", content, re.IGNORECASE):
        if any(marker in p for p in paths for marker in DOCS_LIKE):
            return ask("API key de ejemplo en documentación detectada. Confirma que es ficticia.")
        return deny("Asignación hardcodeada de API key (>=24 caracteres) detectada.")
    return None


def evaluate(payload):
    tool_name = payload.get("tool_name", "")
    tool_input = payload.get("tool_input") or {}
    paths = target_paths(tool_input)

    for path in paths:
        result = check_sensitive_path(path)
        if result:
            return result

    if tool_name == "Bash":
        cmd = (tool_input.get("command") or "").strip()
        for pattern, reason in BASH_DENY:
            if re.search(pattern, cmd, re.IGNORECASE):
                return deny(f"Comando denegado: {reason}")
        for pattern, reason in BASH_ASK:
            if re.search(pattern, cmd, re.IGNORECASE):
                return ask(reason)
        return None

    if tool_name in WRITE_TOOLS:
        for path in paths:
            norm = path.replace("\\", "/")
            if any(re.search(p, norm) for p in PROTECTED_WRITE_PATHS):
                return ask(f"Escritura en configuración protegida de guardrails: {path}")
        content = written_content(tool_name, tool_input)
        if content:
            return check_content(content, paths)

    return None


def main():
    try:
        raw = sys.stdin.read()
        result = evaluate(json.loads(raw)) if raw.strip() else None
    except Exception as e:  # fail safe: ask a human
        result = ask(f"payments-guard.py falló ({e}); confirma manualmente.")
    if result:
        result["hookEventName"] = "PreToolUse"
        sys.stdout.write(json.dumps({"hookSpecificOutput": result}) + "\n")


if __name__ == "__main__":
    main()
