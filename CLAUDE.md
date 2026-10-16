# Open Payments / Rafiki — guía del proyecto

Proyecto de pagos con Open Payments, Interledger y Rafiki sobre Next.js + TypeScript. Las skills de dominio están en `.claude/skills/` (checkout, transferencias, webhooks, cliente server-only, Rafiki local, ILP, arquitectura Next.js). Adaptado de `lastHunter956/skills-hackaton-medellin` (Apache-2.0).

## Flujo de trabajo

1. **Inspeccionar antes de cambiar:** revisa el estado del repo y del entorno antes de proponer cambios.
2. **Proponer antes de codificar** en cambios de arquitectura o de flujos de dinero; espera aprobación.
3. **Fases pequeñas y reversibles**, cada una en un commit atómico.
4. **Reportar con evidencia:** solo acciones ejecutadas, con comandos y salidas reales.

## Restricciones

- **Secretos:** no leer, crear ni versionar `.env*` (salvo `.env.example`) ni claves (`*.pem`, `*.key`, `*.p12`). Ningún secreto en código; todo por variables de entorno.
- **Fondos:** solo testnet o Rafiki local. Nunca credenciales, wallets ni dinero real.
- **Git:** no `git push`, `push --force`, `rebase`, `commit --amend` ni `reset --hard` sin que el usuario lo pida.
- **Comandos:** no `rm -rf`, `sudo`, `curl | sh`, `docker --privileged`, ni montar `/var/run/docker.sock`.
- **Base de datos:** no migraciones destructivas (`DROP TABLE`/`DROP COLUMN`) fuera de desarrollo local autorizado.
- **Dependencias:** auditar antes de instalar y fijar versión exacta.
- **Dominio:** no inventar endpoints, payloads ni comportamientos de Open Payments/Interledger; verificar contra https://openpayments.dev y https://rafiki.dev.

## Invariantes de pagos (fuente única)

Las copias en `.claude/skills/*/references/invariants.md` derivan de esta sección; si cambias una, actualízalas todas.

- **Cero floats:** montos como enteros en unidad mínima (`value` string entero o `bigint`). Nada de `number` para cálculos o conversiones.
- **Tupla monetaria:** todo monto lleva `value`, `assetCode` y `assetScale`.
- **Estados:** `PENDING`, `AUTHORIZED`, `PROCESSING`, `COMPLETED`, `FAILED`, `CANCELLED`. Transición ilegal → error de dominio y rollback.
- **`COMPLETED` solo con prueba verificable** (webhook firmado de Rafiki o confirmación criptográfica). Crear el outgoing payment no implica completado.
- **Idempotencia:** toda petición que mueva fondos lleva `Idempotency-Key` determinista; no reintentar débitos sin revisar el intento persistido.
- **Aislamiento:** SDK de Open Payments y claves de firma solo en módulos `server-only`. Callbacks GNAP validados contra `state`, `nonce`, usuario y sesión.
- **Auditoría:** cada cambio de estado en `audit_events`, sin PII, tokens ni claves en logs.

## Seguridad

- Validar toda entrada externa en la frontera HTTP con `zod`.
- Roles de base de datos con mínimo privilegio; pedir confirmación antes de mutaciones críticas.
- Nunca `NEXT_PUBLIC_` para claves, secretos o tokens.

## TypeScript / Next.js (`*.ts`, `*.tsx`)

- `strict`, `noImplicitAny`, `exactOptionalPropertyTypes`. Sin `any` (usar `unknown` + type guards); sin `@ts-ignore`/`@ts-nocheck` sin justificación.
- `ignoreBuildErrors` nunca en `true`.
- `"use client"` solo en hojas interactivas; infraestructura, DB y clientes de pago con `import 'server-only'`.
- Errores con `error.tsx`, carga con `loading.tsx`.

## Docker e infraestructura (`infra/**`, `Dockerfile*`, `*.yml`)

- Sin `privileged`, sin `docker.sock`, sin `network_mode: host`; contenedores con usuario no root.
- Tags de imagen fijos (nunca `latest`).
- Compose solo para servicios auxiliares (Postgres, Redis, Rafiki local), con redes bridge explícitas y secretos desde el entorno.
- Mantener `infra/.env.example` con valores seguros de prueba.

## Definition of Done

- `tsc --noEmit` sin errores.
- Linters y tests pasan.
- Resumen de archivos modificados y riesgos residuales.
- Diff libre de secretos.

## Guardrails automáticos

`.claude/settings.json` registra hooks en `.claude/hooks/`:
- `payments-guard.py` (PreToolUse): bloquea `.env`/claves, comandos destructivos, secretos en archivos escritos, `NEXT_PUBLIC_*SECRET`, `ignoreBuildErrors: true`, Open Payments en `"use client"`; pide confirmación para commits, instalaciones, `docker compose up` y migraciones.
- `track-verification.py` (PostToolUse) + `done-gate.py` (Stop): si se tocó código, pide correr `tsc --noEmit` y tests antes de terminar (máx. 2 veces por sesión).

El servidor MCP `op-sandbox` (`.mcp.json`) solo permite localhost y testnet (`*.ilp.rafiki.money`, `*.test.interledger.org`).
