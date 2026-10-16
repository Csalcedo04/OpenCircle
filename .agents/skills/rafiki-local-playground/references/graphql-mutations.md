# Operaciones GraphQL de Administración en Rafiki

Documento de referencia técnica con las operaciones canónicas de la API GraphQL Admin de Rafiki (`/graphql`).

---

## 1. Gestión de Assets

### Consulta de Assets Existentes
```graphql
query GetAssets {
  assets {
    edges {
      node {
        id
        code
        scale
        createdAt
      }
    }
  }
}
```

### Creación de Nuevo Asset
```graphql
mutation CreateAsset($input: CreateAssetInput!) {
  createAsset(input: $input) {
    code
    success
    message
    asset {
      id
      code
      scale
    }
  }
}
```
*Variables de ejemplo:*
```json
{
  "input": {
    "code": "USD",
    "scale": 2
  }
}
```

---

## 2. Gestión de Wallet Addresses

### Creación de Dirección de Billetera
```graphql
mutation CreateWalletAddress($input: CreateWalletAddressInput!) {
  createWalletAddress(input: $input) {
    code
    success
    message
    walletAddress {
      id
      url
      publicName
      status
      asset {
        code
        scale
      }
    }
  }
}
```
*Variables de ejemplo:*
```json
{
  "input": {
    "assetId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "url": "http://127.0.0.1:3000/accounts/merchant",
    "publicName": "Merchant Local Store"
  }
}
```

---

## 3. Depósito de Liquidez y Financiación

### Depósito en la Cuenta de Liquidación del Asset
```graphql
mutation DepositLiquidity($input: DepositEventLiquidityInput!) {
  depositEventLiquidity(input: $input) {
    code
    success
    message
    error
  }
}
```
*Variables de ejemplo:*
```json
{
  "input": {
    "eventId": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    "idempotencyKey": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
  }
}
```

---

## 4. Consulta de Pagos y Cuentas de Liquidación

```graphql
query GetWalletAddress($id: String!) {
  walletAddress(id: $id) {
    id
    url
    status
    asset {
      code
      scale
    }
  }
}
```
