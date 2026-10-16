# Matriz de Calidad para Autoría de Skills

Toda nueva skill debe auditarse contra esta matriz antes de considerarse completa.

## Criterios de Calidad

| ID | Criterio | Verificación |
| :--- | :--- | :--- |
| **QC-01** | **Descripción Inequívoca** | Longitud ≤ 1024 caracteres (ideal ~400); redactada en 3ª persona; cláusulas explícitas de CUÁNDO y CUÁNDO NO usar. |
| **QC-02** | **Límite de Líneas** | El archivo principal `SKILL.md` tiene estrictamente menos de 200 líneas. |
| **QC-03** | **Progressive Disclosure** | Los detalles técnicos extensos residen en `references/` y no saturan el archivo principal. |
| **QC-04** | **Cero Secretos** | Ningún archivo contiene tokens, claves privadas ni datos sensibles hardcodeados. |
| **QC-05** | **No Duplicación de Invariantes** | Enlaza a `references/invariants.md` (copia de `CLAUDE.md`) sin redefinir invariantes financieras. |
| **QC-06** | **Scripts Ejecutables con Ayuda** | Si incluye subcarpeta `scripts/`, cada script acepta `--help` y retorna exit 0. |
| **QC-07** | **Aprobación Humana** | Los puntos críticos de mutación requieren consulta explícita al usuario. |
| **QC-08** | **Cero Carpetas Vacías** | No existen carpetas `scripts/`, `examples/` ni `resources/` sin archivos. |
