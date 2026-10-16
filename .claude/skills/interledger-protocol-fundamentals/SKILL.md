---
name: interledger-protocol-fundamentals
description: >-
  Manual conceptual de Interledger Protocol (ILP): modelo en capas, paquetes
  Prepare/Fulfill/Reject, transporte STREAM y relación con Rafiki y Open
  Payments. Usar al diseñar modelos contables y comprender enrutamiento ILP. NO
  usar para implementar flujos de Open Payments (usar open-payments-transfers).
  Use for Interledger/ILP concepts: packet lifecycle, STREAM, connectors, ILP
  addresses, reject codes, how ILP relates to Rafiki and Open Payments.
---

# Fundamentos del Protocolo Interledger (ILP)

Esta skill proporciona la base conceptual y técnica del protocolo Interledger para la interoperabilidad entre diferentes redes de pago y sistemas contables.

---

## 1. Alcance y Cuándo Usar

- **Cuándo Usar:** Al diseñar modelos contables en Rafiki, auditar el enrutamiento de transacciones ILP, interpretar códigos de rechazo o comprender la capa de transporte.
- **Cuándo NO Usar:** Para implementar flujos comerciales de alto nivel de Open Payments (utilizar `open-payments-transfers` o `incoming-payments-checkout`).

---

## 2. Arquitectura en Capas

El protocolo Interledger se organiza en una jerarquía análoga a la pila de Internet (TCP/IP):

1. **Capa de Aplicación:** Open Payments, SPSP, interfaces bancarias y de comercio.
2. **Capa de Transporte:** STREAM (Simple Two-way Resource and Exchange Protocol).
3. **Capa Interledger:** Formato de paquetes ILP (`Prepare`, `Fulfill`, `Reject`) y direccionamiento.
4. **Capa de Enlace:** BTP (Bilateral Transfer Protocol), WebSockets o RPC HTTP entre peers directos.
5. **Capa de Liquidación:** Redes subyacentes (blockchains, ACH, SPEI, transferencias internas).

---

## 3. Ciclo de Vida de Paquetes ILP

Una transferencia condicional atraviesa tres estados formales:

- **`ILP Prepare`:** El conector bloquea temporalmente los fondos en el origen y propaga el paquete con una condición criptográfica (hash SHA-256) y un plazo de vencimiento.
- **`ILP Fulfill`:** Si el receptor recibe el paquete y acepta la transferencia, devuelve una preimagen criptográfica de 32 bytes que desbloquea los fondos en cadena a través de todos los conectores.
- **`ILP Reject`:** Si se supera el plazo de caducidad o no hay liquidez suficiente, se emite un rechazo tipado que libera las retenciones en los libros de los peers.

Consultar detalles y prefijos en [ilp-layers-packets.md](./references/ilp-layers-packets.md).

---

## 4. Diferenciación: ILP vs. Open Payments

- **ILP:** Opera a nivel de paquete de red. Garantiza que el dinero no se duplique ni se pierda mediante transferencias condicionales de dos fases (Two-Phase Commit).
- **Open Payments:** Es una API REST segura basada en GNAP que orquesta acuerdos de pago antes de que se transmita el primer paquete ILP.
- Para un desglose comparativo completo, consultar [ilp-vs-open-payments.md](./references/ilp-vs-open-payments.md).

---

## 5. Referencias y Documentación
- Paquetes, prefijos y códigos de error: [ilp-layers-packets.md](./references/ilp-layers-packets.md)
- Comparación de capas ILP vs Open Payments: [ilp-vs-open-payments.md](./references/ilp-vs-open-payments.md)
- Fuentes oficiales y fechas: [sources.md](./references/sources.md)
