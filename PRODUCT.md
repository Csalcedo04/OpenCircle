# OpenCircle — producto

Documento de producto: qué es OpenCircle, cómo funciona hoy y qué falta. Las reglas de código y las
invariantes de pagos viven en [`CLAUDE.md`](CLAUDE.md); la marca, en [`DESIGN.md`](DESIGN.md).

## Qué es

**OpenCircle** es una **natillera** (círculo de ahorro rotativo) sobre **Open Payments**. Un grupo de
personas aporta el mismo monto en cada turno a un fondo común, y en cada turno una de ellas recibe el
pozo completo. OpenCircle aplica las reglas: quién paga, cuándo, a quién le toca y qué pasa si alguien
no paga. Los aportes se cobran desde la billetera Open Payments de cada miembro, con su autorización.

Es una **demo de hackathon en la red de pruebas de Interledger**: no se mueve dinero real. En
producción, cada fondo lo custodiaría una entidad financiera autorizada.

## Para quién

- **Ahorradores** que ya hacen natilleras entre amigos, familia o vecinos y quieren que se cumplan
  solas: pagos a tiempo, sin que una persona tenga que perseguir a las demás ni custodiar el dinero.
- **Organizadores** que crean el círculo, definen el monto y el turno, y quieren transparencia sobre
  quién pagó.

## Recorrido del usuario

1. **Entrar** con enlace mágico al correo (sin contraseñas). Ver círculos y miembros requiere sesión.
2. **Onboarding, paso 1 — datos**: nombre, documento (cc, ti, ce o pasaporte), fecha de nacimiento,
   nacionalidad y teléfono (indicativo + número, validado por país).
3. **Onboarding, paso 2 — billetera**: el usuario escribe su usuario de la billetera de prueba y
   **autoriza a OpenCircle en su propia billetera** (consentimiento interactivo GNAP). OpenCircle
   recibe permiso para crear cotizaciones y pagos salientes, para cobrar los aportes sin pedirlo en
   cada turno; el usuario puede revocarlo desde su billetera.
4. **Verificación de identidad (KYC)** con **Didit**, obligatoria para crear o unirse a un círculo.
5. **Crear o unirse a un círculo**: cada miembro elige su turno de entrega. Cuando se llena el último
   cupo, el círculo arranca: se programan todos los turnos y se abre el primero.
6. **Turnos**: en cada turno se cobra el aporte a cada miembro (incluido quien recibe) y, con todos
   los pagos verificados, se entrega el pozo menos la comisión.

## Estado actual

| Parte | Estado |
|---|---|
| Entrada con enlace mágico, cierre de sesión, regreso a la página de origen | ✅ |
| Onboarding (datos con selectores de país e indicativo; billetera con consentimiento GNAP) | ✅ |
| KYC con Didit (sesión, consulta de decisión, webhook firmado) | ✅ |
| API de círculos: listar, ver, crear, unirse, inicio automático al llenarse | ✅ |
| Páginas de círculos y miembros conectadas a la API | ❌ aún usan datos de demostración |
| Cobro de aportes por Open Payments y relojes de prueba por periodo | 🔄 PR #13 en revisión |
| Entrega del pozo al beneficiario | ❌ por construir |
| Puntaje de cumplimiento y cupo de microcrédito | ⚙️ calculados en el backend, sin exponer |
| Flujo de aprobación de solicitudes para unirse | ⚠️ hay una migración aplicada en la base compartida que no está en ninguna rama; su autor debe subirla |

## Reglas de negocio

- **Montos enteros** en la unidad mínima del activo, siempre con `assetCode` y `assetScale`.
- **Cada miembro paga en todos los turnos**, incluido quien recibe: pozo = aporte × tamaño.
- **Un turno solo se paga con pruebas**: un aporte cuenta como pagado únicamente con confirmación
  verificable (webhook firmado de Rafiki o lectura del estado del pago), nunca solo por crearlo.
- **Una billetera por usuario**; una billetera no puede estar en dos cuentas.
- **Valores provisionales** (hasta que el equipo defina la política): comisión 2 % del pozo, umbral
  de riesgo igual a un aporte, peso de la autorización recurrente 50 %.

El detalle (estados de pago, idempotencia, aislamiento, auditoría) está en
[`CLAUDE.md` → Invariantes de pagos](CLAUDE.md).

## Arquitectura

| Pieza | Tecnología | Dónde corre |
|---|---|---|
| Frontend | Next.js 16 (App Router), TypeScript estricto, Tailwind v4 | Vercel — `interledger-opencircle.vercel.app` |
| Backend | Express 5, Drizzle, Zod | Railway — servicio `api` |
| Base de datos y auth | Supabase (Postgres compartido por el equipo, Supabase Auth) | Supabase |
| Pagos | Open Payments SDK, red de prueba de Interledger (Rafiki) | `interledger-test.dev` |
| Identidad | Didit (KYC) | Didit |

- Local: `npm install` y `npm run dev` en la raíz levantan backend (`:3000`) y frontend (`:3001`).
- Pruebas: `npm test` en `backend/` (incluye suites contra la base compartida); `pnpm test` y
  `pnpm test:e2e` en `frontend/`.
- Despliegue: `./scripts/deploy.sh [all|frontend|backend]` desde `main`.
- Migraciones: la base es compartida; antes de generar o aplicar una, compara las aplicadas con los
  archivos de `backend/drizzle` y sube la tuya pronto para no chocar en la numeración.

## Fuera de alcance (por ahora)

- Dinero real, custodia y licencias: solo red de prueba.
- Contraseñas: la entrada es solo con enlace mágico, por decisión de producto.
- Aplicación móvil nativa: la web está diseñada para teléfonos.
