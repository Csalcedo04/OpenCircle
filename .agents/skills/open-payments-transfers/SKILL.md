---
name: open-payments-transfers
description: >-
  Flujo procedimental para resolver Wallet Addresses, crear Incoming Payments,
  negociar Grants GNAP y emitir Outgoing Payments con Open Payments y Rafiki.
  Usar al implementar transferencias o cobros. NO usar para mutaciones directas
  de base de datos ni para estilos visuales de frontend. Use for sending
  money/transfers with Open Payments: wallet address lookup, GNAP grants
  (interactive consent), quotes, outgoing payments, idempotency.
---

# Flujo de Transferencias con Open Payments y Rafiki

Este documento describe el procedimiento formal para realizar pagos y transferencias entre cuentas mediante Open Payments y el servidor de autorización GNAP de Rafiki.

> [!IMPORTANT]
> **Invariantes Financieras Obligatorias:** Todas las reglas de precisión numérica (cero floats, unidad mínima), máquina de estados formal, idempotencia y módulos server-only están regidas por [invariants.md](./references/invariants.md). Queda prohibido eludir dichas reglas.

---

## 1. Propósito
Estandarizar el ciclo de vida de un pago entre dos entidades de servicio de cuentas (ASE / FSP) asegurando consentimiento del usuario, idempotencia y confirmación verificable.

## 2. Cuándo Activar
- Al implementar endpoints o acciones de servidor para transferir fondos o cobrar.
- Al integrar el SDK de Open Payments con servidores de Rafiki (local o testnet).
- Al manejar callbacks de consentimiento interactivo GNAP.

## 3. Cuándo NO Activar
- Para diseño de interfaces de usuario o componentes puramente cosméticos (usar directivas de React/Next.js).
- Para mutaciones directas en la base de datos sin interacción con el protocolo Open Payments.

## 4. Entradas Requeridas
- `senderWalletAddress`: URL de la billetera origen del emisor.
- `receiverWalletAddress`: URL de la billetera destino del receptor.
- `amount`: Valor en su unidad mínima como cadena entera (ej. `"1000"` para $10.00 con escala 2).
- Claves privadas y credenciales del cliente Open Payments (inyectadas vía variables de entorno).

---

## 5. Procedimiento Paso a Paso

### Paso 1: Resolver la Wallet Address Receptora
1. Realiza una petición GET autenticada o pública a `receiverWalletAddress`.
2. Extrae `assetCode`, `assetScale` y la URL de `authServer`.
3. Valida que el host pertenezca a la allowlist autorizada (herramienta MCP `mcp__op-sandbox__verify_wallet_address`).

### Paso 2: Crear el Incoming Payment en el Receptor
1. Solicita un grant no interactivo para `incoming-payment` al servidor de autorización del receptor si es requerido.
2. Crea el recurso `Incoming Payment` especificando el monto con la tupla monetaria obligatoria (`value`, `assetCode`, `assetScale`).
3. Guarda el `incomingPaymentId` y su URL completa.

### Paso 3: Negociar el Grant Interactivo (GNAP) en el Emisor
1. Solicita un grant interactivo al `authServer` del emisor para crear un `outgoing-payment`.
2. Especifica el `incomingPaymentId` en la solicitud de acceso para acotar el consentimiento.
3. Genera y persiste un par criptográfico `state` y `nonce` asociado a la sesión del usuario.
4. Redirige al usuario al URL de interacción retornado por el servidor GNAP.
5. Para especificaciones detalladas del handshake, consulta [references/gnap-flow.md](./references/gnap-flow.md).

### Paso 4: Validar el Callback de Consentimiento
1. Al recibir la redirección en `/api/consent/callback`, extrae `interact_ref`, `state` y `hash`.
2. Verifica que el `state` coincida con el guardado en base de datos para ese usuario y sesión.
3. Intercambia el `interact_ref` por el token de acceso final contra el endpoint de continuación de GNAP.

### Paso 5: Emitir el Outgoing Payment con Idempotencia
1. Genera una clave determinista única `Idempotency-Key` (ej. UUID v4 vinculado al intento de pago).
2. Envía la solicitud POST para crear el `Outgoing Payment` en el backend del emisor.
3. Registra el evento en la tabla `audit_events` con estado `PROCESSING`.

### Paso 6: Verificación y Confirmación Criptográfica
1. Monitorea el recurso mediante polling o recepción de webhooks firmados de Rafiki.
2. **PROHIBIDO** marcar el pago como `COMPLETED` sin comprobación verificable.
3. Para la gestión de transiciones de estado y auditoría, consulta [references/verification-flow.md](./references/verification-flow.md).

---

## 6. Salidas Esperadas
- Recurso `Outgoing Payment` registrado en la base de datos local.
- Transición formal del pago a `COMPLETED` o `FAILED`.
- Registro inmutable en `audit_events` sin secretos expuestos.

## 7. Checklist de Verificación
- [ ] Montos expresados como enteros en unidad mínima; ningún float presente.
- [ ] Módulo ejecutado exclusivamente en entorno `server-only`.
- [ ] Callback validado contra `state` y `nonce` persistidos.
- [ ] Solicitud enviada con cabecera `Idempotency-Key`.
- [ ] Estado `COMPLETED` verificado mediante webhook o prueba criptográfica.

## 8. Casos de Error y Condiciones de Parada
- Si la Wallet Address no resuelve o el host no está en la allowlist: detén la operación inmediatamente.
- Si el `state` o `nonce` no coinciden en el callback: revoca el intento y marca como `CANCELLED`.
- Si la llamada HTTP falla por red: no reintentes sin validar primero el estado persistido con la `Idempotency-Key`.

## 9. Fuentes Oficiales y Fecha de Revisión
- Documentación oficial de Open Payments: https://openpayments.dev
- Playground de Rafiki: https://rafiki.dev/integration/playground/overview/
- Fecha de revisión: 2026-10-15
