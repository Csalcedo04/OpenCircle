# Guía Operativa de Agentes - Antigravity CLI

Este repositorio implementa flujos financieros con Open Payments y Rafiki. Toda interacción debe apegarse estrictamente a las fases, restricciones y definiciones descritas a continuación.

---

## 1. Flujo de Trabajo Obligatorio

El agente debe operar en ciclos iterativos, verificables y reversibles:
1. **Inspeccionar y Auditar:** Analizar el estado actual del repositorio, archivos y entorno antes de formular cualquier plan o cambio.
2. **Proponer sin Código:** Presentar la propuesta arquitectónica o de cambios al usuario y esperar aprobación explícita antes de tocar archivos.
3. **Ejecución Incremental:** Trabajar en fases pequeñas, verificables y reversibles. Cada fase concluida debe corresponder a un único commit atómico.
4. **Reporte Transparente:** Informar únicamente las acciones ejecutadas con los comandos y salidas reales obtenidos de la terminal.

---

## 2. Restricciones Agénticas Inviolables

- **Secretos y Entornos:** Nunca leer, modificar, crear ni versionar archivos `.env*` ni claves privadas (`*.pem`, `*.key`). Usar únicamente `.env.example` como plantilla.
- **Entorno de Fondos y Red:** Prohibido el uso de credenciales, wallets o dinero real. Operar exclusivamente en testnet o en instancias locales de Rafiki.
- **Control de Versiones (Git):** Prohibido ejecutar `git push`, `git push --force` o reescribir historial (`rebase`, `commit --amend`).
- **Comandos Destructivos:** Prohibido ejecutar `rm -rf`, `sudo`, `curl | sh` (o pipes a shell), `docker --privileged` o montar `/var/run/docker.sock`.
- **Bases de Datos:** Prohibido ejecutar migraciones destructivas (`DROP TABLE`, `DROP COLUMN`) fuera de entornos de desarrollo local explícitamente autorizados.
- **Gestión de Paquetes:** Nunca instalar dependencias ni skills sin auditar previamente su código fuente y fijar su versión exacta en el gestor de paquetes.
- **Integración Open Payments / Interledger:** Prohibido inventar endpoints, payloads o comportamientos de Open Payments o Interledger; todo dato de dominio debe verificarse contra la documentación oficial.

---

## 3. Definición de Terminado (Definition of Done)

Una tarea se considera completa solo cuando cumple la totalidad de estos criterios:
- `tsc --noEmit` ejecuta sin ningún error de tipado.
- Los linters y la suite de pruebas unitarias/integración pasan satisfactoriamente.
- Se presenta el desglose explícito de archivos modificados y riesgos residuales identificados.
- El diff inspeccionado está 100% libre de secretos, API keys o tokens expuestos.

---

## 4. Mapa de Reglas del Proyecto

Las directivas detalladas se modularizan en `.agents/rules/`:
- **Regla 10 (Dominio de Pagos):** [.agents/rules/10-payments-domain.md](file:///.agents/rules/10-payments-domain.md) — **FUENTE ÚNICA** de invariantes financieras y de negocio.
- **Regla 20 (Seguridad):** [.agents/rules/20-security.md](file:///.agents/rules/20-security.md) — Políticas de secretos y mitigación de riesgos.
- **Regla 30 (TypeScript / Next.js):** [.agents/rules/30-nextjs-typescript.md](file:///.agents/rules/30-nextjs-typescript.md) — Convenciones de código y ejecución server-only.
- **Regla 40 (Docker y Entornos):** [.agents/rules/40-docker-env.md](file:///.agents/rules/40-docker-env.md) — Contenedores seguros y configuración de infraestructura.
