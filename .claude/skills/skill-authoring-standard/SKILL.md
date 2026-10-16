---
name: skill-authoring-standard
description: >-
  Procedimiento estándar para crear, documentar y validar skills de Claude Code
  en este proyecto. Usar al crear nuevas skills operativas. NO usar para
  directivas globales de código (usar CLAUDE.md) ni para tareas sin flujo
  procedimental paso a paso. Use when creating or editing a Claude Code skill
  under .claude/skills in this project.
---

# Estándar de Creación de Skills en Claude Code

Esta skill define el procedimiento uniforme para diseñar, documentar y verificar cualquier skill de este proyecto.

## Principios Rectores

1. **Progressive Disclosure:** Claude solo carga `name` y `description` hasta que la skill se activa; el cuerpo de `SKILL.md` se carga al usarla y los archivos de `references/` solo cuando se leen. Mantén `SKILL.md` por debajo de 200 líneas y delega payloads, esquemas y manuales a `references/`.
2. **Invariantes Financieras:** Nunca inventes ni redefinas invariantes de pagos. La fuente de verdad es la sección "Invariantes de pagos" de `CLAUDE.md`; si la skill las necesita, copia `references/invariants.md` de una skill existente y enlázalo.
3. **Scripts Seguros:** Todo script en `scripts/` debe aceptar `--help` y retornar exit 0. Referéncialo con ruta relativa a la skill para que Claude lo ejecute en vez de leerlo.
4. **Cero Carpetas Vacías:** Solo crea `scripts/`, `examples/` o `references/` si contienen archivos necesarios.

---

## Procedimiento de Creación Paso a Paso

### 1. Definición y Delimitación
- `name`: minúsculas, dígitos y guiones (máx. 64), igual al nombre de la carpeta.
- `description`: es lo único que Claude ve para decidir si activa la skill. Indica qué hace, cuándo usarla y cuándo NO. Incluye términos en español e inglés con los que el usuario pediría la tarea. Límite duro: 1024 caracteres.
- Campos opcionales de frontmatter: `allowed-tools` (herramientas permitidas sin pedir permiso mientras la skill está activa), `disable-model-invocation: true` (solo invocable con `/<nombre>`, útil para acciones con efectos secundarios), `argument-hint`.

### 2. Estructuración del Directorio
Crea la jerarquía bajo `.claude/skills/<nombre>/`:
```text
.claude/skills/<nombre>/
├── SKILL.md
└── references/
    └── <guia-detallada>.md
```

### 3. Redacción del Contenido
- Aplica la plantilla de [references/skill-template.md](./references/skill-template.md).
- Sigue las reglas de redacción técnica de [references/prompting-rules.md](./references/prompting-rules.md).
- Audita todos los criterios de [references/quality-checklist.md](./references/quality-checklist.md).
- Para herramientas MCP usa el nombre completo `mcp__<servidor>__<herramienta>`.

### 4. Verificación
Tras escribir la skill, ejecuta:
```bash
python3 .claude/skills/skill-authoring-standard/scripts/validate-skill.py .claude/skills/<nombre>
```
Las skills nuevas se detectan al iniciar sesión; reinicia Claude Code si no aparece en la lista.
