# Manual end-to-end checklist

`pnpm test:e2e` covers everything inside OpenCircle. These steps happen on other sites (an email
inbox, the Interledger test wallet, Didit), so they're checked by hand before a demo or release.

Setup: `backend/.env` and `frontend/.env.local` filled in (see the `.env.example` files), both apps
running (`npm run dev` in `backend/`, `pnpm dev -p 3001` in `frontend/`), and a test wallet at
https://wallet.interledger-test.dev that is **not** OpenCircle's own.

## 1. Sign up with a real magic link
- [ ] `/es/login` → enter a real email → "Revisa tu correo" appears.
- [ ] The email arrives (Supabase may rate-limit its built-in sender; use custom SMTP for demos).
- [ ] Clicking the link lands on `/es/onboarding`, signed in (header shows "Cerrar sesión").
- [ ] Optional: open the same link on another device. With the `token_hash` email template it
      signs in there too; with Supabase's default template it shows "enlace no válido".

## 2a. Onboarding with an OpenCircle account (automated by `internal-account.spec.ts`)
- [ ] Step 1: fill in name, document, birth date, nationality, phone → "Paso 2 de 2 · Cómo pagarás".
- [ ] "Abrir mi cuenta OpenCircle" → `/es/circles`; `GET /api/users/me` shows `internalAccount`
      with the balance from the backend's `DEMO_SEED_VALUE` (a `SEED` movement on `/es/account`).

## 2b. Onboarding with your own wallet (Interledger test network)
- [ ] Step 2: "Conectar mi billetera" → enter your test wallet (`$ilp.interledger-test.dev/<you>`)
      → the wallet's consent page opens.
- [ ] It names OpenCircle and asks for **outgoing payments and quotes, with no amount limit**.
- [ ] **Approve** → back on OpenCircle at `/es/circles`; `GET /api/users/me` shows your `walletAddress`.
- [ ] Repeat with a second account and **decline** → back on onboarding's wallet step with
      "La conexión con la billetera no fue aprobada".
- [ ] From `/es/account`, a user with only an OpenCircle account links a wallet in the wallet card;
      after approving, they land back on `/es/account` with the wallet shown as connected.

## 3. Identity verification (Didit)
- [ ] `/es/circles/new` → "Verifica tu identidad" → "Verificar mi identidad" opens `verify.didit.me`.
- [ ] Complete it with a real ID and selfie → back on `/es/circles/new`, the create form appears.
- [ ] In the Didit console the session's `vendor_data` is your user id (no name or email).
- [ ] If the result is "In Review": the page says it's under review; approving it in the Didit
      console unlocks the form on the next visit, or immediately once the webhook is set up.

## 4. Didit webhook (needs a public backend URL)
- [ ] Expose the backend (deploy, or `cloudflared tunnel --url http://localhost:3000`).
- [ ] Didit console → webhook destination `https://<public>/api/webhooks/didit`; its secret is `DIDIT_WEBHOOK_SECRET`.
- [ ] Change a session's status in the console → `kyc_verifications.status` follows within seconds.

## 5. Deposit into an OpenCircle account (Interledger test network)
- [ ] With an OpenCircle account: `/es/account` → "Recargar" → amount → "Crear solicitud de pago".
- [ ] The deposit page shows a payment request URL on `ilp.interledger-test.dev` (an incoming payment
      on OpenCircle's wallet) and "Esperando el pago".
- [ ] From your own test wallet, send exactly that amount to the URL. Within seconds the page flips to
      "Recibido" and `/es/account` shows the new balance and a "Depósito" movement from
      "Billetera de OpenCircle".
- [ ] With a linked wallet: "Pagar con mi billetera" pays it through your grant; the result is the same.
- [ ] Create a request and don't pay it: after 30 minutes it shows "Vencido" and nothing is credited.

## 6. Return to where you started
- [ ] Signed out, open a circle's join page → "Iniciar sesión" → finish sign-in, onboarding and
      wallet consent in the same browser → you land back on that join page.
