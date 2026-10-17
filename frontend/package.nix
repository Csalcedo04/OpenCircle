{
  lib,
  stdenv,
  nodejs_22,
  pnpm_10,
  fetchPnpmDeps,
  pnpmConfigHook,
  makeBinaryWrapper,
  writableTmpDirAsHomeHook,
  # Build-time environment. Next inlines NEXT_PUBLIC_* into the browser bundle
  # at build time, so public values (the ones listed in .env.example under
  # "Public") must be passed here, e.g. via `frontend.override { nextPublicEnv = { ... }; }`.
  # Only public values belong here: anything in nextPublicEnv ends up in the Nix store
  # and in the client bundle. Server-only secrets are read at runtime, never here.
  # With an empty nextPublicEnv the app builds without Supabase and serves demo data.
  nextPublicEnv ? { },
}:

let
  packageJson = lib.importJSON ./package.json;
in
stdenv.mkDerivation (finalAttrs: {
  pname = "opencircle-frontend";
  version = packageJson.version;

  # Explicit allow-list: never pick up node_modules, .next, .env* or editor files.
  src = lib.fileset.toSource {
    root = ./.;
    fileset = lib.fileset.unions [
      ./package.json
      ./pnpm-lock.yaml
      ./pnpm-workspace.yaml
      ./next.config.ts
      ./tsconfig.json
      ./components.json
      ./public
      ./src
    ];
  };

  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src;
    pnpm = pnpm_10;
    fetcherVersion = 4;
    hash = "sha256-gaebSgnxUxHsKZEAmbtHkFI1Nz+JYeaQX6ArOZxg+Rg=";
  };

  nativeBuildInputs = [
    nodejs_22
    pnpm_10
    pnpmConfigHook
    makeBinaryWrapper
    writableTmpDirAsHomeHook
  ];

  env = {
    NEXT_TELEMETRY_DISABLED = "1";
  }
  // nextPublicEnv;

  buildPhase = ''
    runHook preBuild
    pnpm build
    runHook postBuild
  '';

  # Next's standalone output is a self-contained server (server.js + the traced
  # node_modules). Static assets and public/ are not included and must sit next
  # to it, mirroring what `next start` would serve.
  #
  # server.js chdirs into the (read-only) store path, so Next never finds a
  # dotenv file there. Node loads one from the launch directory instead, when
  # present, like `next start` in a checkout. Only runtime (server-only)
  # variables matter here: NEXT_PUBLIC_* are already baked into the bundle.
  # Exported variables take precedence over the file.
  installPhase = ''
    runHook preInstall

    app=$out/share/opencircle-frontend
    mkdir -p $out/bin $app/.next
    cp -r .next/standalone/. $app/
    cp -r .next/static $app/.next/static
    cp -r public $app/public

    makeBinaryWrapper ${lib.getExe nodejs_22} $out/bin/opencircle-frontend \
      --set NODE_ENV production \
      --set NEXT_TELEMETRY_DISABLED 1 \
      --set-default PORT 3000 \
      --set-default HOSTNAME 0.0.0.0 \
      --add-flags "--env-file-if-exists=.env" \
      --add-flags "$app/server.js"

    runHook postInstall
  '';

  doDist = false;

  meta = {
    description = "OpenCircle web app (Next.js) for the Interledger Hackathon Medellín 2026";
    mainProgram = "opencircle-frontend";
    platforms = lib.platforms.linux ++ lib.platforms.darwin;
  };
})
