# OpenCircle — Product Truth & Operating Context

Documento de verdad duradera del producto, objetivos de negocio y contexto operativo para OpenCircle.

---

## 1. Tesis y Propósito del Producto

**OpenCircle** es una pasarela y suite financiera de cobros y pagos transfronterizos construida sobre el estándar abierto **Open Payments** y el protocolo **Interledger (ILP)** con liquidación a través del conector **Rafiki**.

Permite a comercios y creadores recibir pagos globales instantáneos en cualquier moneda o activo digital, mientras que los pagadores liquidan desde su propia billetera Open Payments mediante consentimientos interactivos seguros (GNAP).

---

## 2. Arquetipos de Usuario

1. **El Comercio / Creador Receptor:**
   - **Objetivo:** Generar enlaces de cobro (`Incoming Payments`) o botones de checkout con liquidación garantizada y bajas comisiones.
   - **Necesidad:** Conciliación transparente en tiempo real y confirmación verificable (webhooks firmados de Rafiki).
2. **El Pagador / Cliente:**
   - **Objetivo:** Pagar de forma fluida y transparente en su divisa local sin conversiones abusivas.
   - **Necesidad:** Flujo de autorización interactivo GNAP claro, donde se muestre el monto exacto debitado, sin sorpresas ni fricción.
3. **El Desarrollador / Integrador:**
   - **Objetivo:** Integrar APIs seguras con SDKs `server-only`, Route Handlers validados con Zod y webhooks con protección contra repetición.

---

## 3. Invariantes de Negocio y Restricciones Inmutables

1. **Cero Floats (Precisión Financiera Total):** Todo monto monetario se manipula como entero en su unidad mínima (`value` string o `bigint`) junto con `assetCode` y `assetScale`. Prohibido el uso de tipos `number` de JavaScript para cálculos financieros.
2. **Máquina de Estados Finita:** Los pagos transitan estrictamente por:
   `PENDING` -> `AUTHORIZED` -> `PROCESSING` -> `COMPLETED` | `FAILED` | `CANCELLED`.
3. **Prueba Verificable de Pago:** Un pago solo alcanza `COMPLETED` tras la recepción y validación criptográfica de un webhook firmado de Rafiki.
4. **Idempotencia Determinista:** Toda solicitud saliente que inicie o altere fondos debe incluir `Idempotency-Key`.
5. **Aislamiento Criptográfico:** Claves privadas de firma (formato Ed25519 o similar) e instancias del SDK residen exclusivamente en módulos marcados con `import 'server-only'`.

---

## 4. Experiencia y Tono Visual

- **Identidad:** Inspirada en la confianza editorial de Mastercard (Canvas Cream `#F3F0EE`, Signal Orange `#CF4500`, Ink Black `#141413`).
- **Tono de Voz:** Institucional pero accesible, transparente, matemático y directo. Sin promesas exageradas ("revoluciona tus finanzas"), con énfasis en la velocidad, seguridad e interoperabilidad de estándares abiertos.
