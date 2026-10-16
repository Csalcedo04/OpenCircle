# Fuentes Oficiales y Trazabilidad

Documento de fuentes oficiales para la skill `webhook-signature-verification`.

---

## 1. Documentación Oficial de Rafiki

1. **Requisitos de Integración y Verificación de Webhooks:**
   - URL: `https://rafiki.dev/integration/requirements/webhook-events/`
   - Cita literal: *"The webhook body must be JSON canonicalized before HMAC computation."*
   - Cita literal: *"Use HMAC SHA-256 with the SIGNATURE_SECRET environment variable as the key and the signed payload string as the message."*
   - Fecha de consulta: 2026-10-15

2. **Implementación de Referencia en el Repositorio de Rafiki:**
   - URL: `https://github.com/interledger/rafiki/blob/main/packages/backend/src/webhook/service.ts`
   - Línea 3: `import { canonicalize } from 'json-canonicalize'`
   - Líneas 313-322: Construcción del payload firmado concatenando `${timestamp}.${canonicalize({ id, type, data })}` y firma con `createHmac('sha256', secret)`.
   - Fecha de consulta: 2026-10-15

3. **Librería de Canonicalización (RFC 8785):**
   - Paquete npm: `json-canonicalize` (versión 3.0.1)
   - Especificación: JCS / RFC 8785 (JSON Canonicalization Scheme)
   - Fecha de consulta: 2026-10-15

---

## 2. Aclaración Importante sobre Homónimos

> [!CAUTION]
> **Diferenciación de Producto:** El dominio `docs.rafiki.com` y la cabecera `X-Rafiki-Webhook-Signature` corresponden a una empresa y producto comercial totalmente ajeno ("Rafiki AI / Conversational Intelligence"), NO al software de código abierto Interledger Rafiki (`rafiki.dev`). No utilizar dicha documentación.
