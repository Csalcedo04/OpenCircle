# Verificación de Pagos y Máquina de Estados

Detalle de los mecanismos de comprobación y registro inmutable para transacciones Open Payments.

## 1. Ciclo Formal de la Máquina de Estados

```text
[PENDING] ---> [AUTHORIZED] ---> [PROCESSING] ---> [COMPLETED]
    |               |                 |
    +---------------+-----------------+---------> [FAILED / CANCELLED]
```

- **`PENDING`:** Intento de transferencia creado en la base de datos local.
- **`AUTHORIZED`:** Consentimiento GNAP validado exitosamente.
- **`PROCESSING`:** Outgoing payment emitido en el FSP emisor con `Idempotency-Key`.
- **`COMPLETED`:** Recepción de webhook firmado de Rafiki o verificación criptográfica.
- **`FAILED` / `CANCELLED`:** Aborto por error de fondos, expiración o rechazo de consentimiento.

## 2. Invariante de Confirmación Verificable
El estado `COMPLETED` es irreversible y solo puede registrarse cuando:
- Se recibe el evento `outgoing_payment.created` o `outgoing_payment.completed` validado con firma HMAC/HTTP signatures del servidor de Rafiki.
- O bien una consulta activa GET al recurso retorna `sentAmount.value` coincidente y estado final completado.

## 3. Registro en `audit_events`
Cada transición debe generar una fila inmutable con:
- `event_id` (UUID)
- `payment_id`
- `previous_state` y `new_state`
- `timestamp` UTC
- `metadata` (sin PII, sin tokens bearer, sin claves privadas)
