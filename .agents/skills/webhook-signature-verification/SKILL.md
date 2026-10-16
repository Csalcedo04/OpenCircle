---
name: webhook-signature-verification
description: >-
  Procedimiento para verificar firmas HMAC y HTTP signatures en webhooks
  entrantes de Rafiki y Open Payments. Usar al implementar endpoints de
  notificación y confirmación verificable de pagos. NO usar para transferencias
  salientes ni para peticiones directas de usuarios. Use for Rafiki webhook
  endpoints: Rafiki-Signature HMAC verification, JSON canonicalization (RFC
  8785), replay protection, marking payments completed.
---

# Verificación Criptográfica de Webhooks de Rafiki

Este documento define el procedimiento para autenticar y validar la integridad de las notificaciones de eventos emitidas por instancias de Rafiki hacia nuestra aplicación.

> [!IMPORTANT]
> **Invariante de Confirmación Verificable:** Según [invariants.md](./references/invariants.md), un pago solo puede transitar al estado `COMPLETED` tras validar formalmente la firma del evento de webhook o prueba criptográfica.

---

## 1. Propósito
Garantizar que todo evento que altere la máquina de estados de un pago provenga genuinamente del servidor de Rafiki configurado y no haya sido manipulado ni reenviado.

## 2. Cuándo Activar
- Al construir o modificar el Route Handler `/api/webhooks/rafiki`.
- Al procesar eventos de finalización de pagos entrantes (`incoming_payment.completed`) o salientes (`outgoing_payment.completed`).

## 3. Cuándo NO Activar
- Para transferencias salientes o negociación GNAP (usar `open-payments-transfers`).
- Para validar peticiones originadas directamente por clientes o navegadores web.

## 4. Entradas Requeridas
- `rawText`: Texto de la petición leído mediante `await req.text()`.
- Cabecera `Rafiki-Signature` con formato `t=<timestamp>, v<version>=<digest>`.
- Variable de entorno `SIGNATURE_SECRET` con la clave simétrica y `SIGNATURE_VERSION` (por defecto `1`).

---

## 5. Procedimiento Paso a Paso

### Paso 1: Lectura y Parsing del Cuerpo
1. En el Route Handler (`app/api/webhooks/rafiki/route.ts`), lee el cuerpo mediante `await req.text()`.
2. Parsea el texto con `JSON.parse(rawText)`. La prohibición de deserializar antes de firmar aplica únicamente a proveedores que firman bytes crudos; Rafiki requiere deserializar y canonicalizar.
3. Canonicaliza el objeto JSON usando el estándar JCS / RFC 8785 (`json-canonicalize`): `canonicalize({ id: event.id, type: event.type, data: event.data })`.

### Paso 2: Extracción y Validación de Cabeceras
1. Obtén la cabecera `Rafiki-Signature` y extrae timestamp (`t`), versión (`v1`) y digest.
2. Comprueba que la versión coincida con `SIGNATURE_VERSION` (por defecto `1`). Si difiere, rechaza la petición.
3. Verifica que la marca temporal esté dentro del rango de tolerancia (máximo 300 segundos) para neutralizar ataques de repetición.

### Paso 3: Cálculo y Comparación Criptográfica
1. Construye el payload firmado concatenando: `${timestamp}.${canonicalBody}`.
2. Calcula el HMAC SHA-256 de dicho payload usando `SIGNATURE_SECRET` en formato hexadecimal.
3. Compara el digest generado contra la firma recibida empleando comparación en tiempo constante (`crypto.timingSafeEqual`).
4. Para implementaciones de algoritmos y librerías nativas, consulta [references/signature-algorithms.md](./references/signature-algorithms.md).

### Paso 4: Mapeo y Transición Atómica
1. Una vez validada la firma, extrae el identificador del pago (`data.id`) y el tipo de evento (`type`).
2. Actualiza la orden en base de datos hacia `COMPLETED` o `FAILED`.
3. Inserta una fila en `audit_events` registrando la verificación criptográfica exitosa sin almacenar tokens ni claves privadas.

---

## 6. Salidas Esperadas
- Código HTTP 200/204 devuelto al emisor del webhook.
- Actualización atómica en la base de datos local hacia el estado final del pago.
- Registro auditable inmutable.

## 7. Checklist de Verificación
- [ ] Cuerpo JSON deserializado y canonicalizado según RFC 8785 antes del cálculo HMAC.
- [ ] Versión del header cotejada con `SIGNATURE_VERSION`.
- [ ] Ventana de tiempo validada para mitigar replay attacks.
- [ ] Comparación de hashes realizada con `timingSafeEqual`.
- [ ] Transición a `COMPLETED` ejecutada únicamente si la firma fue exitosa.

## 8. Casos de Error y Condiciones de Parada
- Si la firma no coincide: responde inmediatamente con HTTP 401 Unauthorized y no ejecutes ninguna mutación.
- Si la marca temporal expiró (> 300s): responde con HTTP 400 Bad Request.
- Si el evento contiene un estado ilegal para la máquina de estados: registra la anomalía y aborta la transacción.

## 9. Fuentes Oficiales y Fecha de Revisión
- Documentación oficial de Webhooks de Rafiki: https://rafiki.dev/integration/webhook-events/
- Fecha de revisión: 2026-10-15
