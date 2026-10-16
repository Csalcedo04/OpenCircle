# Configuración de TypeScript Estricto en Next.js

Este documento define la plantilla y opciones recomendadas para garantizar seguridad de tipos en proyectos financieros con Next.js.

---

## 1. Opciones Clave en `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "exactOptionalPropertyTypes": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

---

## 2. Tipado Seguro de Variables de Entorno

Se recomienda validar las variables de entorno en tiempo de inicio mediante un esquema Zod centralizado (`src/env.ts`):

```typescript
import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  RAFIKI_GRAPHQL_URL: z.string().url().default("http://127.0.0.1:3001/graphql"),
  RAFIKI_SIGNATURE_SECRET: z.string().min(16),
  OPEN_PAYMENTS_KEY_ID: z.string().uuid(),
});

export const env = envSchema.parse(process.env);
```
