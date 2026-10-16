# Distinción de Capas: Interledger (ILP) vs. Open Payments

Este documento aclara la separación de responsabilidades entre la capa de transporte Interledger y la capa de aplicación Open Payments.

---

## 1. Tabla Comparativa

| Dimensión | Interledger Protocol (ILP) | Open Payments |
| :--- | :--- | :--- |
| **Capa** | Red y Transporte (equivalente a IP/TCP) | Aplicación y Autorización (equivalente a HTTP/REST) |
| **Protocolo de Enlace** | Paquetes binarios OER / STREAM | JSON sobre HTTPS con HTTP Message Signatures |
| **Autorización** | Criptográfica simétrica (hashes SHA-256) | Asimétrica y delegada (GNAP, Ed25519) |
| **Rol de Rafiki** | Conector y libro contable de liquidación | Servidor de autorización y proveedor de API REST |
| **Entidad Primaria** | Paquetes condicionales de valor | Wallets, cotizaciones, pagos entrantes y salientes |

---

## 2. Flujo Integrado

1. **Fase de Negociación (Open Payments):**
   - El cliente obtiene un grant GNAP del `authServer`.
   - Se crea una cotización (`quote`) para conocer el costo de la ruta y las comisiones.
   - El pagador autoriza el monto total requerido.

2. **Fase de Ejecución (Rafiki e Interledger):**
   - Rafiki fragmenta el monto total acordado en microporciones transmitidas vía paquetes STREAM.
   - Cada paquete `Prepare` viaja a través de los conectores reteniendo saldo en libros.
   - Al llegar al receptor, el paquete es liberado (`Fulfill`) y los fondos se liquidan en destino.

3. **Fase de Notificación (Webhooks):**
   - Rafiki dispara un evento `outgoing_payment.completed` o `incoming_payment.completed` a la aplicación.
