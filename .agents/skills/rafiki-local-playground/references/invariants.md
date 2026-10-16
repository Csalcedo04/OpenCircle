<!-- Copia compacta de la sección "Invariantes de pagos" de CLAUDE.md. Si cambias una, actualiza todas las copias (*/references/invariants.md). -->

# Invariantes Financieras de Dominio (Open Payments)

Este documento contiene las reglas de negocio e invariantes obligatorias para operaciones financieras.

## 1. Precisión Numérica y Moneda
- Cero Floats: Todo valor monetario debe representarse como entero en su unidad mínima (`value` como string entero o bigint).
- Tupla Monetaria Obligatoria: Toda entidad de monto debe asociar `value`, `assetCode` (ej. ISO 4217) y `assetScale`.
- Prohibido el uso de tipos de coma flotante nativos para cálculos intermedios o conversiones.

## 2. Máquina de Estados de Pagos
- Estados formales: `PENDING`, `AUTHORIZED`, `PROCESSING`, `COMPLETED`, `FAILED`, `CANCELLED`.
- El estado `COMPLETED` se alcanza ÚNICAMENTE tras confirmación criptográfica o webhook verificado de Rafiki/Open Payments. Nunca asumas pago completado al crear la transferencia.

## 3. Idempotencia y Reintentos
- Toda solicitud saliente que debite fondos o inicie pagos debe incluir una `Idempotency-Key` única y determinista.
- Prohibido reintentar débitos a ciegas sin verificar el estado del intento previo persistido.

## 4. Aislamiento Criptográfico y Auditoría
- Claves privadas de firma residen exclusivamente en módulos protegidos con directiva `server-only`.
- Prohibido registrar claves privadas, tokens de acceso o datos confidenciales en consola o tablas de auditoría.
