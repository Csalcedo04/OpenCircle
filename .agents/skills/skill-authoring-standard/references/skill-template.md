# Plantilla Oficial de Skill

Copia esta estructura al redactar el archivo `SKILL.md` de una nueva skill.

```markdown
---
name: <nombre-de-la-skill>
description: "Describe en tercera persona qué hace la skill. Incluye CUÁNDO usarla y CUÁNDO NO usarla explícitamente. Máximo 1024 caracteres (límite de Claude Code); apunta a ~400."
---

# <Título de la Skill>

## 1. Propósito
Define en un párrafo conciso la meta operativa de esta skill.

## 2. Cuándo Activar
- Situación de activación 1
- Situación de activación 2

## 3. Cuándo NO Activar
- Escenario donde debe usarse una alternativa (ej. directiva global en rules)
- Escenario fuera del alcance de este procedimiento

## 4. Entradas Requeridas
- Parámetros, rutas de archivos o credenciales simuladas necesarias.

## 5. Procedimiento Paso a Paso
1. **Paso 1:** Acción concreta y verificable.
2. **Paso 2:** Acción subsiguiente con validación intermedia.
3. **Paso 3:** Cierre del procedimiento.

## 6. Salidas Esperadas
- Artefactos generados o estados de máquina alcanzados.

## 7. Checklist de Verificación
- [ ] Criterio de éxito 1
- [ ] Criterio de éxito 2

## 8. Casos de Error y Condiciones de Parada
- Si ocurre X: acción inmediata de contención y detención.

## 9. Fuentes Oficiales y Fecha de Revisión
- Documentación oficial consultada: <URL>
- Fecha de última revisión: AAAA-MM-DD
```
