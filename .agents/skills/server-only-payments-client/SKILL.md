---
name: server-only-payments-client
description: >-
  Procedimiento para estructurar el cliente de Open Payments en aplicaciones
  Next.js usando App Router, Server Actions y Route Handlers aislados con
  'server-only'. Usar al implementar llamadas seguras al SDK de Open Payments y
  firmar peticiones HTTP. NO usar en frontend del navegador, páginas públicas ni
  componentes interactivos de cliente. Use when creating the
  @interledger/open-payments client in Next.js: server-only modules, key
  loading, Server Actions, DTOs, error mapping.
---

# Cliente Open Payments Seguro en Next.js (Server-Only)

Esta skill proporciona el patrón arquitectónico estándar para instanciar y consumir el SDK de Open Payments de forma segura dentro del ecosistema Next.js App Router.

> Las invariantes monetarias y reglas de seguridad se detallan en [invariants.md](./references/invariants.md) y en [security-patterns.md](./references/security-patterns.md).

---

## 1. Entradas y Configuración Requerida

- Variables de entorno del servidor (nunca prefijadas con `NEXT_PUBLIC_`):
  - `OPEN_PAYMENTS_KEY_ID`: Identificador de clave pública registrado en el auth server.
  - `OPEN_PAYMENTS_PRIVATE_KEY_PATH`: Ruta al archivo de clave privada (o contenido PEM en entorno seguro).
  - `OPEN_PAYMENTS_WALLET_ADDRESS`: URL canónica del wallet local/servidor.

---

## 2. Procedimiento de Implementación

### Paso 1: Forzar Frontera de Servidor con `server-only`
1. Requerir la directiva `import 'server-only'` en la primera línea del módulo cliente (ej. `src/lib/payments/client.ts`).
2. Cualquier intento de importar este archivo desde componentes de UI del navegador provocará un fallo inmediato en tiempo de compilación.

### Paso 2: Carga Segura de Credenciales y Claves
1. Leer las variables de entorno exclusivamente dentro de funciones de backend.
2. Validar que la clave privada exista y tenga formato PEM válido.
3. Nunca registrar la clave privada ni partes de la misma en logs de consola o tablas de auditoría.

### Paso 3: Inicialización Singleton del Cliente Autenticado
1. Importar el inicializador del cliente desde `@interledger/open-payments`.
2. Instanciar el cliente reutilizando la promesa singleton para evitar recrear conexiones o releer archivos de claves en cada llamada.
3. Configurar el timeout y validación de endpoints según el entorno.

### Paso 4: Exposición Segura Mediante Server Actions y DTOs
1. Los componentes de React (UI) nunca reciben la instancia del SDK ni tokens GNAP de acceso.
2. Definir Server Actions en `src/app/actions/payments.ts` con directiva de servidor.
3. Todo dato retornado hacia el cliente debe ser un Data Transfer Object (DTO) plano y sanitizado, sin cabeceras de firma ni secretos.

### Paso 5: Manejo Centralizado de Errores de Dominio
1. Capturar excepciones del SDK y traducirlas a tipos de error de dominio controlados.
2. Devolver objetos estructurados `{ success: false, error: 'PAYMENT_FAILED', message: string }` para que la interfaz los procese adecuadamente.

---

## 3. Condiciones de Parada y Prohibiciones

- **Directiva Prohibida:** Prohibido importar módulos de Open Payments en la capa de interfaz o navegador web.
- **Exposición de Variables:** Prohibido utilizar `NEXT_PUBLIC_` en variables relacionadas con claves de firma o tokens de autorización.
- **Detener la Operación si:**
  - El compilador o linter detecta fuga de tipos de backend al bundle del navegador.
  - La clave de firma no está presente en el entorno seguro.

---

## 4. Referencias y Documentación
- Patrones arquitectónicos y ejemplos de DTO: [security-patterns.md](./references/security-patterns.md)
- Invariantes financieras y seguridad: [invariants.md](./references/invariants.md)
