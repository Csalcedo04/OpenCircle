# Patrones de Seguridad y Aislamiento en Next.js

Este documento describe los patrones de diseño recomendados para aislar el cliente de pagos y prevenir fugas de secretos hacia el cliente web.

---

## 1. Patrón Singleton para el Cliente Autenticado

El cliente Open Payments realiza validaciones criptográficas y firmas HTTP que requieren recursos computacionales. Se debe implementar un patrón singleton en Node.js para reutilizar la instancia autenticada.

```typescript
import 'server-only'
import { createAuthenticatedClient } from '@interledger/open-payments'

let clientPromise: ReturnType<typeof createAuthenticatedClient> | null = null

export async function getPaymentsClient() {
  if (!clientPromise) {
    const keyId = process.env.OPEN_PAYMENTS_KEY_ID
    const privateKeyPath = process.env.OPEN_PAYMENTS_PRIVATE_KEY_PATH

    if (!keyId || !privateKeyPath) {
      throw new Error('Faltan credenciales requeridas de Open Payments')
    }

    clientPromise = createAuthenticatedClient({
      keyId,
      privateKey: privateKeyPath,
      requestTimeoutMs: 10000,
    })
  }

  return clientPromise
}
```

---

## 2. Aislamiento DTO en Server Actions

Los componentes de interfaz no deben recibir objetos directos del SDK ni cabeceras con tokens de acceso. Las Server Actions actúan como aduana de datos:

```typescript
'use server'

import { getPaymentsClient } from '@/lib/payments/client'
import type { CheckoutSessionDTO } from '@/types/payments'

export async function createCheckoutAction(orderId: string): Promise<CheckoutSessionDTO> {
  const client = await getPaymentsClient()
  
  // Lógica de creación de Incoming Payment en backend
  const incomingPayment = await client.incomingPayment.create(/* ... */)

  // Retorno estricto de DTO sanitizado
  return {
    orderId,
    paymentId: incomingPayment.id,
    expiresAt: incomingPayment.expiresAt,
    amount: {
      value: incomingPayment.incomingAmount.value,
      assetCode: incomingPayment.incomingAmount.assetCode,
      assetScale: incomingPayment.incomingAmount.assetScale,
    },
  }
}
```

---

## 3. Manejo de Variables de Entorno

- **Regla Estricta:** Las variables de Open Payments (`KEY_ID`, `PRIVATE_KEY`, `CLIENT_SECRET`) nunca deben tener el prefijo `NEXT_PUBLIC_`.
- La ausencia de este prefijo garantiza que Next.js elimine automáticamente cualquier referencia en caso de fuga al bundle del navegador.
- En producción, las claves deben inyectarse mediante gestores de secretos o montajes de volumen seguros con permisos de solo lectura (`0400`).
