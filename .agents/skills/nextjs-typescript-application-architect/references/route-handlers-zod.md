# Patrones de Route Handlers y Validación Zod

Guía de referencia para estructurar controladores HTTP en Next.js App Router con esquemas Zod en frontera.

---

## 1. Estructura de un Route Handler con Zod

```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const createOrderSchema = z.object({
  customerId: z.string().uuid(),
  amount: z.object({
    value: z.string().regex(/^\d+$/, "El valor debe ser entero en unidades minimas"),
    assetCode: z.string().min(3).max(4),
    assetScale: z.number().int().min(0).max(18),
  }),
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const result = createOrderSchema.safeParse(json);

    if (!result.success) {
      return NextResponse.json(
        { error: "VALIDATION_FAILED", details: result.error.flatten() },
        { status: 400 }
      );
    }

    const { customerId, amount } = result.data;
    // Procesamiento seguro con tipos verificados
    return NextResponse.json({ success: true, orderId: "ord_123" });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
```

---

## 2. Diferenciación: Handlers de Negocio vs. Webhooks de Pagos

- **Endpoints REST estándar:** Pueden deserializar directamente con `req.json()` si la carga útil no requiere validación criptográfica previa.
- **Endpoints de Webhooks:** Cuando el proveedor firma la petición (como Rafiki con `Rafiki-Signature`), el contenido debe preservarse para validación de firma antes de deserializar, delegando en la skill `webhook-signature-verification`.
