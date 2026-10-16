---
name: rafiki-local-playground
description: >-
  Procedimiento para interactuar con la instancia local de Rafiki mediante su
  API GraphQL Admin (creación de cuentas, gestión de assets, peers ILP y
  webhooks de prueba). Usar para depuración, testing e inicialización de
  entornos locales de liquidación y wallets. NO usar en entornos productivos,
  transferencias salientes de usuario ni transacciones reales. Use for a local
  Rafiki instance: GraphQL Admin API, assets, wallet addresses, liquidity,
  peers, test webhooks, and the op-sandbox MCP tools.
---

# Gestión de Rafiki Local mediante GraphQL Admin

Esta skill define el procedimiento para interactuar de forma segura con la API administrativa de Rafiki en entornos locales de desarrollo y pruebas.

> Las restricciones de aislamiento de red y puertos de contenedores se limitan a 127.0.0.1. Las invariantes monetarias se rigen por [invariants.md](./references/invariants.md).

---

## 1. Entradas y Parámetros

- `graphqlEndpoint`: Endpoint de administración de Rafiki (por defecto `http://127.0.0.1:3001/graphql`).
- `assetCode`: Código de moneda ISO o ILP (ej. `USD`, `EUR`).
- `assetScale`: Escala decimal en enteros (ej. `2` para centavos, `9` para micropagos).
- `walletAddressUrl`: URL del wallet address a registrar (ej. `http://127.0.0.1:3000/accounts/alice`).

---

## 2. Procedimiento Operativo

### Paso 1: Verificar Estado del Servicio Local
1. Comprobar que los servicios de base de datos y backend de Rafiki estén escuchando en `127.0.0.1`.
2. Ejecutar una consulta básica de introspección o consulta de assets para verificar conectividad.
3. Si el servicio no responde, verificar el estado de los contenedores (`docker compose ps` / `docker compose logs`; ver sección Docker de `AGENTS.md`).

### Paso 2: Crear o Obtener el Asset Financiero
1. Consultar si el asset ya existe mediante la query `assets`.
2. Si no existe, invocar la mutación `createAsset` especificando `code` y `scale`.
3. Guardar el `asset.id` retornado (UUID) para las operaciones subsecuentes.

### Paso 3: Aprovisionar Wallet Address de Prueba
1. Invocar la mutación `createWalletAddress` asociando:
   - `assetId`: Identificador del asset creado en el paso anterior.
   - `url`: Endpoint canónico del wallet address local.
2. Confirmar que la dirección devuelta esté en estado `ACTIVE`.

### Paso 4: Depositar Liquidez Simulada
1. En entornos de prueba, las cuentas de liquidación del conector ILP requieren saldo inicial.
2. Invocar la mutación `depositLiquidity` proporcionando:
   - `assetId`: ID del asset.
   - `amount`: Monto en unidades mínimas enteras (sin decimales).
   - `idempotencyKey`: UUID determinista para evitar duplicaciones.
3. Validar que la respuesta confirme el crédito en el libro contable de Rafiki.

### Paso 5: Monitoreo de Eventos Locales
1. Configurar la URL de destino de webhooks en la configuración de Rafiki apuntando al receptor local.
2. Verificar que los eventos de pago (`incoming_payment.completed`, `outgoing_payment.created`) se entreguen al handler local.

---

## 3. Manejo de Errores y Condiciones de Parada

- **Conexión Rechazada:** Si el puerto 3001 no responde, detener el procedimiento y verificar que los servicios locales estén levantados.
- **Conflicto de Asset Existente:** Si el código y escala ya existen, reutilizar el `assetId` existente en lugar de duplicar.
- **Detener la Operación si:**
  - Se intenta ejecutar sobre un host remoto que no sea `localhost` o `127.0.0.1`.
  - Los montos de depósito contienen punto flotante (violación de [invariants.md](./references/invariants.md)).
  - Se solicitan credenciales de producción o fondos reales.

---

## 4. Herramientas MCP (`op-sandbox`)

El servidor MCP `op-sandbox` (declarado en `.mcp.json`, script en `scripts/mcp-op-sandbox.py`) restringe las llamadas a localhost y testnet:
- `mcp__op-sandbox__verify_wallet_address`: valida host contra la allowlist y resuelve `assetCode`/`assetScale`/`authServer`.
- `mcp__op-sandbox__create_test_incoming_payment`: crea un incoming payment de prueba (montos como string entero).
- `mcp__op-sandbox__inspect_payment_state`: consulta el estado de un pago.

Si las herramientas no aparecen, el usuario debe aprobar el servidor con `/mcp`.

---

## 5. Referencias y Documentación
- Colección de mutaciones y queries: [graphql-mutations.md](./references/graphql-mutations.md)
- Invariantes financieras: [invariants.md](./references/invariants.md)
