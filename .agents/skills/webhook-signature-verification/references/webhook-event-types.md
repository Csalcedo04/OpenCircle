# Catálogo de Eventos de Webhooks de Rafiki

Mapeo de eventos oficiales emitidos por el backend de Rafiki hacia el dominio local.

## 1. Tipos de Eventos Principales

| Evento | Origen | Significado | Transición de Estado |
| :--- | :--- | :--- | :--- |
| `incoming_payment.created` | Receptor | Se generó la orden de cobro en el ASE destino. | Permanece `PENDING` |
| `incoming_payment.completed` | Receptor | Fondos acreditados en la cuenta receptora. | Transita a `COMPLETED` |
| `incoming_payment.expired` | Receptor | Expiró la ventana temporal sin recibir fondos. | Transita a `CANCELLED` |
| `outgoing_payment.created` | Emisor | Se encoló el pago saliente en el ASE origen. | Transita a `PROCESSING` |
| `outgoing_payment.completed` | Emisor | Paquetes ILP STREAM entregados y liquidados. | Transita a `COMPLETED` |
| `outgoing_payment.failed` | Emisor | Fallo en liquidez, enrutamiento o saldo insuficiente. | Transita a `FAILED` |

## 2. Invariante de idempotencia en recepción
Los webhooks de Rafiki pueden reenviarse ante fallos temporales de red. El receptor debe verificar si el `event_id` ya fue procesado en la tabla `audit_events` antes de mutar saldos.
