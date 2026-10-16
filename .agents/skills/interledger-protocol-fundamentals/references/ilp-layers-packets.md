# Estructura de Paquetes ILP, Prefijos y Códigos de Error

Detalle técnico de los paquetes binarios de Interledger y su esquema de direccionamiento jerárquico.

---

## 1. Direccionamiento ILP

Las direcciones Interledger siguen una estructura jerárquica separada por puntos, similar al DNS:

- `g.` (Global): Red pública principal de producción.
- `test.` (Testnet): Red global de pruebas entre organizaciones federadas.
- `local.` o `private.`: Redes locales de desarrollo o instancias internas de Rafiki.

*Nota de verificación:* Marcar como "verificar en docs" si una red privada particular utiliza prefijos adicionales.

---

## 2. Tipos de Paquetes ILP

| Tipo de Paquete | Función Principal | Campos Críticos |
| :--- | :--- | :--- |
| `Prepare` | Solicitud de débito condicional | `amount`, `expiresAt`, `executionCondition`, `destination` |
| `Fulfill` | Acreditación y liquidación | `fulfillment` (preimagen de 32 bytes) |
| `Reject` | Cancelación de transferencia | `code`, `message`, `triggeredBy` |

---

## 3. Familias de Códigos de Rechazo (`Reject`)

Los códigos de error se dividen en tres familias según su carácter de reintento:

- **`Fxx` (Final Error):** Error irreversible (ej. `F00 Bad Request`, `F01 Invalid Packet`). La petición no debe reintentarse sin modificaciones.
- **`Txx` (Temporary Error):** Falla transitoria de red o liquidez (ej. `T00 Internal Error`, `T04 Insufficient Liquidity`). Reintento permitido tras retroceso exponencial.
- **`Rxx` (Relative Error):** Problema relativo a la ruta o políticas del conector.
