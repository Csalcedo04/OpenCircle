# Reglas de Redacción Técnica para Skills

Instrucciones para redactar procedimientos interpretables y deterministas para el agente.

## 1. Tono Imperativo y Directo
- Utiliza verbos en modo imperativo o infinitivo: *“Ejecuta el script”*, *“Verifica el código de salida”*.
- Evita formulaciones ambiguas como *“Podrías intentar revisar si tal vez...”*.

## 2. Ejemplos de Entrada y Salida
- Proporciona siempre pares contrastados de entrada esperada y salida generada.
- Utiliza bloques de código tipados (`json`, `bash`, `typescript`) con datos realistas de prueba.

## 3. Cláusulas Prohibitivas Claras
- Formula prohibiciones de manera enfática y sin matices: *“PROHIBIDO invocar X sin validar Y previamente”*.
- Especifica la condición de parada inmediata ante fallos imprevistos.

## 4. Pasos Verificables
- Cada paso procedimental debe incluir su criterio de validación:
  - *“Ejecuta el comando Z y comprueba que imprima 'SUCCESS' antes de avanzar al siguiente paso.”*
