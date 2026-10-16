# Algoritmos de Firma y Verificación de Webhooks

Este documento describe la formulación matemática y el código para validar firmas de Rafiki.

## 1. Esquema de Firma HMAC-SHA256
La cabecera `rafiki-signature` envía la estampa de tiempo y el digest en formato:
`t=<timestamp_segundos>,v1=<hex_signature>`

### Algoritmo Oficial de Validación (JCS / RFC 8785):
1. Extrae timestamp (`t`) y digest (`v1`) de la cabecera `Rafiki-Signature`.
2. Verifica que la versión recibida coincida con `SIGNATURE_VERSION` (por defecto `1`).
3. Deserializa el JSON del evento y canonicaliza los campos `{ id, type, data }` mediante `canonicalize` (`json-canonicalize`).
4. Concatena: `signed_payload = timestamp + "." + canonical_body`.
5. Calcula el HMAC SHA-256 con `SIGNATURE_SECRET` y compara mediante tiempo constante (`crypto.timingSafeEqual`).

```typescript
import { createHmac, timingSafeEqual } from "node:crypto";
import { canonicalize } from "json-canonicalize";

export interface RafikiWebhookPayload {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

export function verifyRafikiSignature(
  event: RafikiWebhookPayload,
  signatureHeader: string,
  secret: string,
  expectedVersion: string = "1"
): boolean {
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => p.trim().split("="))
  );
  const timestamp = parts["t"];
  const digest = parts[`v${expectedVersion}`];

  if (!timestamp || !digest) return false;

  const age = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
  if (Math.abs(age) > 300) return false;

  const canonicalBody = canonicalize({
    id: event.id,
    type: event.type,
    data: event.data,
  });

  const expectedHmac = createHmac("sha256", secret)
    .update(`${timestamp}.${canonicalBody}`)
    .digest("hex");

  const expectedBuffer = Buffer.from(expectedHmac, "hex");
  const actualBuffer = Buffer.from(digest, "hex");

  if (expectedBuffer.length !== actualBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, actualBuffer);
}
```
