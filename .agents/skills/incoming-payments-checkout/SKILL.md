---
name: incoming-payments-checkout
description: >-
  Procedimiento para crear Incoming Payments en Open Payments, gestionar
  expiración, enlaces de cobro y conciliar órdenes de checkout. Usar al
  implementar flujos de cobro, facturación o recepción de fondos para comercios.
  NO usar para transferencias salientes (outgoing payments), mutaciones directas
  de base de datos ni firmas de webhooks. Use for Open Payments checkout,
  payment requests, invoices, QR/payment links, incoming payment expiry and
  order reconciliation.
---

# Flujo de Checkout con Incoming Payments

Esta skill describe el procedimiento estándar para orquestar cobros y sesiones de pago en comercios usando Open Payments y Rafiki.

> Las invariantes de montos enteros, tupla monetaria y confirmación criptográfica están definidas en [invariants.md](./references/invariants.md).

---

## 1. Entradas Requeridas

- `merchantWalletAddress`: URL del wallet receptor del comercio (ej. `https://ilp.rafiki.money/merchant`).
- `orderId`: Identificador único de orden interna para trazabilidad.
- `amount`: Monto a cobrar (`value`, `assetCode`, `assetScale`) según [invariants.md](./references/invariants.md).
- `expiresInSeconds`: Ventana de validez del checkout (recomendado: 900 a 1800 segundos).

---

## 2. Procedimiento Operativo

### Paso 1: Resolver Wallet Address del Comercio
1. Invocar el método de resolución del SDK del cliente autenticado.
2. Extraer y verificar:
   - `walletAddress.id`: Identificador canónico del recurso.
   - `walletAddress.assetCode` y `walletAddress.assetScale`: Moneda y escala soportadas.
   - `walletAddress.authServer`: Endpoint GNAP del proveedor.

### Paso 2: Negociar Grant GNAP para Incoming Payment
1. Solicitar un grant no interactivo al `authServer` del comercio.
2. Definir los derechos de acceso en el payload:
   - `type`: `"incoming-payment"`
   - `actions`: `["create", "read"]`
   - `identifier`: `walletAddress.id`
3. Almacenar el `access_token.value` temporal en memoria del proceso servidor.

### Paso 3: Crear el Recurso de Incoming Payment
1. Construir la solicitud de creación enviando:
   - `walletAddress`: URL del wallet receptor.
   - `incomingAmount`: Objeto con `value` (string entero), `assetCode` y `assetScale`.
   - `expiresAt`: Marca temporal ISO-8601 calculada (`ahora + expiresInSeconds`).
   - `metadata`: Objeto con `orderId` y referencias internas no sensibles.
2. Realizar la llamada HTTP firmada con la clave privada del cliente Open Payments.
3. Almacenar en la base de datos local la tupla: `(orderId, incomingPaymentId, expiresAt, status='PENDING')`.

### Paso 4: Generar Payload o Enlace de Checkout
1. Exponer al frontend únicamente la URL resoluble del incoming payment (`incomingPayment.id`).
2. Generar el código QR o deep link Interledger correspondiente para la billetera del pagador.
3. Iniciar el temporizador de cuenta regresiva en el frontend basado en `expiresAt`.

### Paso 5: Conciliación de Pago
1. La confirmación del pago **nunca** se infiere por sondeo continuo (polling) del frontend.
2. La orden transita a `PAID` exclusivamente al recibir el evento firmado de webhook procesado por la skill webhook-signature-verification.
3. Si la fecha actual supera `expiresAt` sin evento de cobro, la orden transita a `EXPIRED`.

---

## 3. Manejo de Errores y Excepciones

- **Desajuste de Escala o Moneda:** Si el `assetCode` de la orden difiere del wallet del comercio, rechazar inmediatamente la creación de la sesión.
- **Expiración de Sesión:** Si el usuario intenta pagar un incoming payment caducado, el wallet del pagador rechazará la cotización. El sistema debe ofrecer regenerar el checkout con un nuevo recurso.
- **Detener la Operación si:**
  - El monto contiene decimales o formato flotante (violación de las invariantes).
  - La clave de firma del cliente no está configurada en el entorno seguro.
  - El servidor de autorización rechaza el grant GNAP.

---

## 4. Referencias y Documentación
- Detalle del ciclo de vida y transiciones: [checkout-lifecycle.md](./references/checkout-lifecycle.md)
- Invariantes de dominio de pagos: [invariants.md](./references/invariants.md)
