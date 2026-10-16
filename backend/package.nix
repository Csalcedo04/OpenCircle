{
  lib,
  buildNpmPackage,
  nodejs_22,
  makeBinaryWrapper,
}:

let
  packageJson = lib.importJSON ./package.json;
  buildNpmPackage' = buildNpmPackage.override { nodejs = nodejs_22; };
in
buildNpmPackage' (finalAttrs: {
  pname = "opencircle-backend";
  version = packageJson.version;

  # Explicit allow-list: never pick up node_modules, dist, .env* or editor files.
  src = lib.fileset.toSource {
    root = ./.;
    fileset = lib.fileset.unions [
      ./package.json
      ./package-lock.json
      ./tsconfig.json
      ./src
      ./test
      ./drizzle
    ];
  };

  # Regenerate after changing package-lock.json: set to "", build, copy `got:`.
  npmDepsHash = "sha256-fU30dF5/PZUtsEshOJisyRSk99GYH/bWrYip2O7qEzk=";

  nativeBuildInputs = [ makeBinaryWrapper ];

  # buildPhase defaults to `npm run build` (tsc → dist/).

  # The suite only needs loopback (allowed in the sandbox) and fake env values.
  doCheck = true;
  checkPhase = ''
    runHook preCheck
    npm test
    runHook postCheck
  '';

  # Ship the compiled server with production dependencies only. Runtime config
  # (PORT, DATABASE_URL, SUPABASE_URL; see .env.example) comes from the
  # environment, or from a .env in the current directory when one exists
  # (same as `npm start`). Variables already exported take precedence.
  installPhase = ''
    runHook preInstall

    npm prune --omit=dev --no-save --ignore-scripts

    app=$out/share/opencircle-backend
    mkdir -p $out/bin $app
    cp -r dist package.json node_modules $app/
    cp -r drizzle $app/drizzle

    makeBinaryWrapper ${lib.getExe nodejs_22} $out/bin/opencircle-backend \
      --set NODE_ENV production \
      --add-flags "--env-file-if-exists=.env" \
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
