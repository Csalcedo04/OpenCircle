---
name: nextjs-typescript-application-architect
description: >-
  Procedimiento de arquitectura en Next.js App Router con TypeScript estricto,
  variables de entorno validadas, Route Handlers y esquemas Zod en frontera.
  Usar para estructurar endpoints de pago seguros y validar tipos. NO usar para
  instanciar el cliente Open Payments (server-only-payments-client) ni verificar
  firmas (webhook-signature-verification). Use for Next.js App Router + strict
  TypeScript structure of payment apps: route handlers, Zod validation, typed
  env vars, tsconfig.
---

# Arquitectura de Aplicaciones Next.js y TypeScript para Pagos

Esta skill establece las pautas de arquitectura, tipado estricto y diseño de endpoints en Next.js App Router para sistemas que integran Open Payments y Rafiki.

---

## 1. Entradas y Requisitos

- Configuración de TypeScript con opciones estrictas de compilación activadas.
- Esquemas de validación en tiempo de ejecución (Zod) para toda carga externa.
- Variables de entorno del servidor tipadas y aisladas del bundle del cliente.

---

## 2. Procedimiento de Implementación

### Paso 1: Configurar TypeScript Estricto
1. Ajustar `tsconfig.json` para garantizar chequeo estricto de tipos (`strict: true`, `noImplicitAny: true`, `exactOptionalPropertyTypes: true`).
2. Consultar las directivas oficiales en [tsconfig-strict.md](./references/tsconfig-strict.md).
3. Asegurar que `next.config.js` no omita errores de tipado en construcción (`ignoreBuildErrors: false`).

### Paso 2: Validación de Frontera con Zod en Route Handlers
1. Definir Route Handlers bajo `src/app/api/<ruta>/route.ts` utilizando la API estándar de Request/Response de Next.js.
2. Validar inmediatamente los parámetros de búsqueda o cuerpos JSON deserializados contra esquemas Zod rigurosos.
3. Para endpoints de webhooks que requieran verificación de firma sobre el payload antes de parsear, delegar el cálculo criptográfico a la skill webhook-signature-verification.
4. Consultar patrones de implementación en [route-handlers-zod.md](./references/route-handlers-zod.md).

### Paso 3: Aislamiento del Cliente de Pagos
1. La inicialización y consumo del SDK de Open Payments debe residir exclusivamente en módulos protegidos con la directiva `server-only`.
2. Para instanciar el cliente autenticado y gestionar claves privadas, referirse a la skill server-only-payments-client.
3. Los componentes visuales de React nunca deben importar tipos ni clientes del backend.

---

## 3. Condiciones de Parada y Prohibiciones

- **Tipos Permisivos:** Prohibido el uso de `any` en interfaces de pagos o modelos de transacciones.
- **Variables Públicas Inseguras:** Prohibido exponer secretos o identificadores sensibles bajo el prefijo `NEXT_PUBLIC_`.
- **Detener la Operación si:**
  - El comando `tsc --noEmit` reporta errores de tipado en cualquier archivo del proyecto.
  - Se detecta importación de módulos de servidor en componentes de cliente.

---

## 4. Referencias y Documentación
- Configuración de TypeScript en Next.js: [tsconfig-strict.md](./references/tsconfig-strict.md)
- Diseño de Route Handlers y Zod: [route-handlers-zod.md](./references/route-handlers-zod.md)
- Fuentes y fechas de consulta: [sources.md](./references/sources.md)
