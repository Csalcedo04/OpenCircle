#!/usr/bin/env bash
# Deploys OpenCircle from this machine: the frontend to Vercel (production) and the
# backend to Railway (service "api"). Environment variables live in each platform's
# settings; this script never reads or prints them.
#
#   ./scripts/deploy.sh                  # both apps
#   ./scripts/deploy.sh frontend         # Vercel only
#   ./scripts/deploy.sh backend          # Railway only
#   ./scripts/deploy.sh all --with-tests # also run the test suites first
#
# Refuses to deploy unless you're on main, with no uncommitted code changes, and not
# behind origin/main, so production always matches main.
set -euo pipefail

FRONTEND_URL="https://interledger-opencircle.vercel.app"
BACKEND_URL="https://api-production-ea396.up.railway.app"
RAILWAY_SERVICE="api"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-all}"
WITH_TESTS=false
for arg in "$@"; do [[ "$arg" == "--with-tests" ]] && WITH_TESTS=true; done

step() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
fail() { printf '  \033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

case "$TARGET" in all | frontend | backend | --with-tests) ;; *) fail "usage: $0 [all|frontend|backend] [--with-tests]" ;; esac
[[ "$TARGET" == "--with-tests" ]] && TARGET="all"
deploys() { [[ "$TARGET" == "all" || "$TARGET" == "$1" ]]; }

# ── Preflight ────────────────────────────────────────────────────────────────
step "Preflight"
cd "$ROOT"
branch="$(git branch --show-current)"
[[ "$branch" == "main" ]] || fail "on '$branch': deploy from main (git checkout main)"
ok "on main"

# The prompt log changes constantly and isn't part of either app.
dirty="$(git status --porcelain -- . ':!AI_USAGE.md')"
[[ -z "$dirty" ]] || fail "uncommitted changes would not match main:"$'\n'"$dirty"
ok "no uncommitted code changes"

git fetch -q origin main
behind="$(git rev-list --count HEAD..origin/main)"
[[ "$behind" == "0" ]] || fail "main is $behind commit(s) behind origin/main: git pull first"
ahead="$(git rev-list --count origin/main..HEAD)"
[[ "$ahead" == "0" ]] && ok "main matches origin/main" || printf '  \033[33m!\033[0m main is %s commit(s) ahead of origin/main (push after deploying)\n' "$ahead"

if deploys frontend; then
  command -v vercel >/dev/null || fail "Vercel CLI missing: npm i -g vercel"
  [[ -f .vercel/project.json ]] || fail "repo root not linked to Vercel: vercel link --scope chu-ventures --project open-circle"
  vercel whoami >/dev/null 2>&1 || fail "not logged in to Vercel: vercel login"
  ok "Vercel CLI ready (project open-circle)"
fi
if deploys backend; then
  command -v railway >/dev/null || fail "Railway CLI missing: npm i -g @railway/cli"
  (cd backend && railway status >/dev/null 2>&1) || fail "backend/ not linked to Railway: cd backend && railway link"
  railway whoami >/dev/null 2>&1 || fail "not logged in to Railway: railway login (in your own terminal)"
  ok "Railway CLI ready (service $RAILWAY_SERVICE)"
fi

# ── Checks: a broken build never ships ───────────────────────────────────────
if deploys backend; then
  step "Backend: install, typecheck, build"
  (cd backend && npm ci --silent && npm run typecheck >/dev/null && npm run build >/dev/null) || fail "backend checks failed"
  ok "backend builds"
  if $WITH_TESTS; then
    (cd backend && npm test >/dev/null) || fail "backend tests failed (npm test in backend/)"
    ok "backend tests pass"
  fi
fi
if deploys frontend; then
  step "Frontend: install, typecheck, lint, build"
  (cd frontend && pnpm install --frozen-lockfile --silent && pnpm typecheck >/dev/null && pnpm lint >/dev/null && pnpm build >/dev/null) ||
    fail "frontend checks failed"
  ok "frontend builds"
  if $WITH_TESTS; then
    (cd frontend && pnpm test >/dev/null) || fail "frontend tests failed (pnpm test in frontend/)"
    ok "frontend tests pass"
  fi
fi

commit="$(git rev-parse --short HEAD)"

# ── Backend → Railway ────────────────────────────────────────────────────────
if deploys backend; then
  step "Backend → Railway ($commit)"
  (cd backend && railway up --service "$RAILWAY_SERVICE" --detach) | grep -E "Build Logs" || true
  status=""
  for _ in $(seq 1 90); do
    status="$(cd backend && railway deployment list --service "$RAILWAY_SERVICE" --json 2>/dev/null |
      node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const d=JSON.parse(s);console.log((Array.isArray(d)&&d[0]?.status)||"")}catch{console.log("")}})')"
    case "$status" in SUCCESS | FAILED | CRASHED | REMOVED) break ;; esac
    sleep 10
  done
  [[ "$status" == "SUCCESS" ]] || fail "Railway deployment ended as '${status:-unknown}' (see the build logs link above)"
  curl -fsS "$BACKEND_URL/api/health" | grep -q '"ok"' || fail "$BACKEND_URL/api/health is not ok"
  ok "backend live: $BACKEND_URL"
fi

# ── Frontend → Vercel ────────────────────────────────────────────────────────
if deploys frontend; then
  step "Frontend → Vercel production ($commit)"
  # Runs from the repo root: the Vercel project's root directory is frontend/.
  # .vercelignore keeps backend/ and every .env* out of the upload.
  vercel deploy --prod --yes >/dev/null 2>&1 || fail "vercel deploy failed (run: vercel deploy --prod)"
  code="$(curl -s -o /dev/null -w '%{http_code}' "$FRONTEND_URL/es")"
  [[ "$code" == "200" ]] || fail "$FRONTEND_URL/es answered $code"
  ok "frontend live: $FRONTEND_URL"
fi

step "Done: $commit deployed ($TARGET)"
