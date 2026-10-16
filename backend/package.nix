{
  lib,
  stdenv,
  nodejs_22,
  pnpm_10,
  fetchPnpmDeps,
  pnpmConfigHook,
  makeBinaryWrapper,
  writableTmpDirAsHomeHook,
}:

let
  packageJson = lib.importJSON ./package.json;
in
stdenv.mkDerivation (finalAttrs: {
  pname = "opencircle-backend";
  version = packageJson.version;

  # Explicit allow-list: never pick up node_modules, dist, .env* or editor files.
  src = lib.fileset.toSource {
    root = ./.;
    fileset = lib.fileset.unions [
      ./package.json
      ./pnpm-lock.yaml
      ./tsconfig.json
      ./src
      ./test
      ./drizzle
    ];
  };

  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src;
    pnpm = pnpm_10;
    fetcherVersion = 4;
    hash = "sha256-WaOebxRnqIwLS8whQTXVnWzniLtU/DNtMPCqs3F3OwA=";
  };

  nativeBuildInputs = [
    nodejs_22
    pnpm_10
    pnpmConfigHook
    makeBinaryWrapper
    writableTmpDirAsHomeHook
  ];

  buildPhase = ''
    runHook preBuild
    pnpm build
    runHook postBuild
  '';

  # The suite only needs loopback (allowed in the sandbox) and fake env values.
  doCheck = true;
  checkPhase = ''
    runHook preCheck
    pnpm test
    runHook postCheck
  '';

  # Ship the compiled server with production dependencies only. Runtime config
  # (PORT, DATABASE_URL, SUPABASE_URL; see .env.example) comes from the
  # environment: the wrapper does not read .env files.
  installPhase = ''
    runHook preInstall

    pnpm prune --prod --ignore-scripts

    app=$out/share/opencircle-backend
    mkdir -p $out/bin $app
    cp -r dist package.json node_modules $app/
    cp -r drizzle $app/drizzle

    makeBinaryWrapper ${lib.getExe nodejs_22} $out/bin/opencircle-backend \
      --set NODE_ENV production \
      --add-flags "$app/dist/server.js"

    runHook postInstall
  '';

  doDist = false;

  meta = {
    description = "OpenCircle API (Express + Open Payments) for the Interledger Hackathon Medellín 2026";
    mainProgram = "opencircle-backend";
    platforms = lib.platforms.linux ++ lib.platforms.darwin;
  };
})
