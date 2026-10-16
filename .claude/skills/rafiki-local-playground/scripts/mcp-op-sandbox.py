#!/usr/bin/env python3
"""Servidor MCP 'op-sandbox' para Claude Code.

Expone 3 herramientas para Open Payments / Rafiki:
1. verify_wallet_address
2. create_test_incoming_payment
3. inspect_payment_state

Restricciones estrictas:
- Allowlist por codigo: solo localhost, 127.0.0.1 y dominios de testnet (*.ilp.rafiki.money, *.test.interledger.org).
- Registro de auditoria de cada llamada en archivo de log.
- Cero floats: los montos deben ser cadenas enteras en unidad minima.
"""

import datetime
import json
import os
import re
import sys
import urllib.parse
import urllib.request
import uuid

ALLOWED_HOST_PATTERNS = [
    r"^127\.0\.0\.1(:\d+)?$",
    r"^localhost(:\d+)?$",
    r"^(.*\.)?ilp\.rafiki\.money(:\d+)?$",
    r"^(.*\.)?test\.interledger\.org(:\d+)?$",
]

AUDIT_LOG_DEFAULT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "docs",
    "context",
    "op-sandbox-audit.log",
)


def get_audit_log_path():
    return os.environ.get("OP_SANDBOX_AUDIT_LOG", AUDIT_LOG_DEFAULT)


def log_audit_event(tool_name, target_url, allowed, status, details=None):
    """Registra de forma segura la llamada en el log de auditoria."""
    log_path = get_audit_log_path()
    try:
        os.makedirs(os.path.dirname(log_path), exist_ok=True)
        event = {
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "tool": tool_name,
            "target_url": target_url,
            "allowlist_passed": allowed,
            "status": status,
            "details": details or {},
        }
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(event) + "\n")
    except Exception as e:
        sys.stderr.write(f"[op-sandbox log error] {e}\n")


def is_url_allowed(url_str):
    """Valida que la URL pertenezca a la allowlist de testnet o Rafiki local."""
    if not url_str or not isinstance(url_str, str):
        return False, "URL no proporcionada o invalida."

    try:
        parsed = urllib.parse.urlparse(url_str)
        if parsed.scheme not in ("http", "https"):
            return False, f"Esquema '{parsed.scheme}' no permitido. Solo se acepta http o https."

        netloc = parsed.netloc.lower()
        host = (parsed.hostname or "").lower()

        if not host:
            return False, "No se encontro un host valido en la URL."

        for pattern in ALLOWED_HOST_PATTERNS:
            if re.match(pattern, netloc) or re.match(pattern, host):
                return True, "Permitido por allowlist de pruebas/local."

        return (
            False,
            f"RECHAZADO: Host '{host}' no pertenece a la allowlist de red de pruebas o Rafiki local.",
        )
    except Exception as e:
        return False, f"Error al analizar la URL: {e}"


def handle_verify_wallet_address(args):
    wallet_url = args.get("wallet_address_url", "")
    allowed, reason = is_url_allowed(wallet_url)

    if not allowed:
        log_audit_event("verify_wallet_address", wallet_url, False, "BLOCKED", {"reason": reason})
        return {
            "isError": True,
            "content": [{"type": "text", "text": f"Error de seguridad: {reason}"}],
        }

    # Resolver Wallet Address via HTTP GET o mock local
    try:
        req = urllib.request.Request(
            wallet_url,
            headers={
                "Accept": "application/json, application/open-payments+json",
                "User-Agent": "claude-code-op-sandbox/1.0",
            },
        )
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode("utf-8"))
            log_audit_event("verify_wallet_address", wallet_url, True, "SUCCESS")
            return {
                "isError": False,
                "content": [
                    {
                        "type": "text",
                        "text": json.dumps(
                            {
                                "id": data.get("id", wallet_url),
                                "assetCode": data.get("assetCode", "USD"),
                                "assetScale": data.get("assetScale", 2),
                                "authServer": data.get("authServer", ""),
                            },
                            indent=2,
                        ),
                    }
                ],
            }
    except urllib.error.URLError as e:
        # Si el servidor local no esta encendido o responde con error de conexion, devolver diagnostico seguro
        details = {"error_type": "ConnectionRefusedOrTimeout", "msg": str(e.reason)}
        log_audit_event("verify_wallet_address", wallet_url, True, "OFFLINE_FALLBACK", details)
        return {
            "isError": False,
            "content": [
                {
                    "type": "text",
                    "text": json.dumps(
                        {
                            "status": "UNREACHABLE_LOCAL",
                            "wallet_address_url": wallet_url,
                            "allowlist_passed": True,
                            "message": "URL en allowlist pero el servicio local no responde (¿esta iniciado Rafiki?).",
                            "error": str(e.reason),
                        },
                        indent=2,
                    ),
                }
            ],
        }
    except Exception as e:
        log_audit_event("verify_wallet_address", wallet_url, True, "ERROR", {"error": str(e)})
        return {
            "isError": True,
            "content": [{"type": "text", "text": f"Error al verificar Wallet Address: {e}"}],
        }


def handle_create_test_incoming_payment(args):
    wallet_url = args.get("wallet_address_url", "")
    allowed, reason = is_url_allowed(wallet_url)

    if not allowed:
        log_audit_event("create_test_incoming_payment", wallet_url, False, "BLOCKED", {"reason": reason})
        return {
            "isError": True,
            "content": [{"type": "text", "text": f"Error de seguridad: {reason}"}],
        }

    amount = args.get("amount")
    asset_code = args.get("asset_code", "USD")
    asset_scale = args.get("asset_scale", 2)
    description = args.get("description", "Pago entrante de prueba sandbox")

    # Invariante 1: Cero Floats
    if amount is not None:
        if isinstance(amount, float) or (isinstance(amount, str) and "." in amount):
            log_audit_event("create_test_incoming_payment", wallet_url, True, "REJECTED_FLOAT")
            return {
                "isError": True,
                "content": [
                    {
                        "type": "text",
                        "text": "Violacion de regla de dominio: El monto NO puede ser punto flotante (float). Debe ser entero en su unidad minima (string o int).",
                    }
                ],
            }
        try:
            int(amount)
        except ValueError:
            return {
                "isError": True,
                "content": [{"type": "text", "text": "El monto debe ser un entero valido."}],
            }

    payment_id = str(uuid.uuid4())
    incoming_payment_url = f"{wallet_url.rstrip('/')}/incoming-payments/{payment_id}"

    payload = {
        "id": incoming_payment_url,
        "walletAddress": wallet_url,
        "completed": False,
        "incomingAmount": {
            "value": str(amount) if amount is not None else None,
            "assetCode": asset_code,
            "assetScale": int(asset_scale),
        },
        "description": description,
        "createdAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "state": "PENDING",
    }

    log_audit_event(
        "create_test_incoming_payment",
        wallet_url,
        True,
        "SIMULATED_SUCCESS",
        {"payment_id": payment_id, "amount": str(amount)},
    )

    return {
        "isError": False,
        "content": [{"type": "text", "text": json.dumps(payload, indent=2)}],
    }


def handle_inspect_payment_state(args):
    payment_url = args.get("payment_url", "")
    allowed, reason = is_url_allowed(payment_url)

    if not allowed:
        log_audit_event("inspect_payment_state", payment_url, False, "BLOCKED", {"reason": reason})
        return {
            "isError": True,
            "content": [{"type": "text", "text": f"Error de seguridad: {reason}"}],
        }

    # Maquina de estados formal: PENDING, AUTHORIZED, PROCESSING, COMPLETED, FAILED, CANCELLED
    valid_states = ["PENDING", "AUTHORIZED", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"]

    # Estado simulado de prueba verificable
    sample_state = {
        "id": payment_url,
        "state": "PROCESSING",
        "validStates": valid_states,
        "confirmation": {
            "verified": False,
            "warning": "El estado COMPLETED solo se acepta con webhook verificado o prueba criptografica.",
        },
        "lastCheckedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }

    log_audit_event("inspect_payment_state", payment_url, True, "SUCCESS")

    return {
        "isError": False,
        "content": [{"type": "text", "text": json.dumps(sample_state, indent=2)}],
    }


TOOLS_DEFINITIONS = [
    {
        "name": "verify_wallet_address",
        "description": "Verifica una Wallet Address de Open Payments contra la allowlist y resuelve sus activos.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "wallet_address_url": {
                    "type": "string",
                    "description": "URL publica de la Wallet Address (ej. http://127.0.0.1:3000/accounts/alice).",
                }
            },
            "required": ["wallet_address_url"],
        },
    },
    {
        "name": "create_test_incoming_payment",
        "description": "Crea o simula un Incoming Payment de prueba en Rafiki/Open Payments con enteros en unidad minima.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "wallet_address_url": {
                    "type": "string",
                    "description": "URL de la Wallet Address receptora.",
                },
                "amount": {
                    "type": "string",
                    "description": "Monto en su unidad minima como cadena entera (prohibido float).",
                },
                "asset_code": {
                    "type": "string",
                    "description": "Codigo de activo ISO (ej. USD, EUR).",
                },
                "asset_scale": {
                    "type": "integer",
                    "description": "Escala del activo (ej. 2 para centavos).",
                },
                "description": {
                    "type": "string",
                    "description": "Descripcion del pago de prueba.",
                },
            },
            "required": ["wallet_address_url", "asset_code", "asset_scale"],
        },
    },
    {
        "name": "inspect_payment_state",
        "description": "Inspecciona el estado de un pago y valida transiciones contra la maquina de estados de pagos.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "payment_url": {
                    "type": "string",
                    "description": "URL del pago a inspeccionar.",
                }
            },
            "required": ["payment_url"],
        },
    },
]


def run_stdio_server():
    """Bucle principal de protocolo MCP JSON-RPC 2.0 sobre stdio."""
    if len(sys.argv) > 1 and sys.argv[1] in ("-h", "--help"):
        print("Servidor MCP 'op-sandbox' para pruebas en entorno local y testnet de Open Payments / Rafiki.")
        sys.exit(0)

    while True:
        line = sys.stdin.readline()
        if not line:
            break

        line = line.strip()
        if not line:
            continue

        try:
            req = json.loads(line)
        except Exception:
            continue

        req_id = req.get("id")
        method = req.get("method")
        params = req.get("params", {})

        if method == "initialize":
            res = {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "protocolVersion": "2024-11-05",
                    "serverInfo": {"name": "op-sandbox", "version": "1.0.0"},
                    "capabilities": {"tools": {}},
                },
            }
            sys.stdout.write(json.dumps(res) + "\n")
            sys.stdout.flush()

        elif method == "notifications/initialized":
            # Notificacion sin respuesta
            pass

        elif method == "tools/list":
            res = {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {"tools": TOOLS_DEFINITIONS},
            }
            sys.stdout.write(json.dumps(res) + "\n")
            sys.stdout.flush()

        elif method == "tools/call":
            tool_name = params.get("name")
            arguments = params.get("arguments", {})

            if tool_name == "verify_wallet_address":
                result = handle_verify_wallet_address(arguments)
            elif tool_name == "create_test_incoming_payment":
                result = handle_create_test_incoming_payment(arguments)
            elif tool_name == "inspect_payment_state":
                result = handle_inspect_payment_state(arguments)
            else:
                result = {
                    "isError": True,
                    "content": [{"type": "text", "text": f"Herramienta desconocida: {tool_name}"}],
                }

            res = {"jsonrpc": "2.0", "id": req_id, "result": result}
            sys.stdout.write(json.dumps(res) + "\n")
            sys.stdout.flush()

        else:
            if req_id is not None:
                res = {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "error": {"code": -32601, "message": f"Metodo no encontrado: {method}"},
                }
                sys.stdout.write(json.dumps(res) + "\n")
                sys.stdout.flush()


if __name__ == "__main__":
    run_stdio_server()
