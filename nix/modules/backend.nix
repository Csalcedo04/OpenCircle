# services.opencircle-backend: the Express API as a systemd service.
#
# The API validates its configuration at start-up (backend/src/config/env.ts;
# documented in backend/.env.example). Public values can go in `environment`;
# anything secret must come from `environmentFile`, which never enters the store.
{ config, lib, ... }:
let
  cfg = config.services.opencircle-backend;

  # Keep in sync with backend/src/config/env.ts.
  requiredVars = [
    "DATABASE_URL"
    "SUPABASE_URL"
    "FRONTEND_URL"
    "OP_CLIENT_WALLET_ADDRESS"
    "OP_KEY_ID"
    "OP_PRIVATE_KEY"
    "GRANT_TOKEN_KEY"
    "DIDIT_API_KEY"
    "DIDIT_WORKFLOW_ID"
  ];
  secretVars = [
    "DATABASE_URL"
    "OP_PRIVATE_KEY"
    "GRANT_TOKEN_KEY"
    "DIDIT_API_KEY"
    "DIDIT_WEBHOOK_SECRET"
  ];

  inEnvironment = name: builtins.hasAttr name cfg.environment;
  missing = lib.filter (name: !(inEnvironment name)) requiredVars;
  leaked = lib.filter inEnvironment secretVars;
in
{
  options.services.opencircle-backend = {
    enable = lib.mkEnableOption "the OpenCircle API (Express)";

    package = lib.mkOption {
      type = lib.types.package;
      description = "The opencircle-backend package to run (flake output `packages.<system>.backend`).";
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 3001;
      description = ''
        TCP port to listen on. Defaults to 3001 so it can share a host with the
        frontend. The API binds all interfaces (it has no bind-address setting),
        so keep the firewall closed unless `openFirewall` is intended.
      '';
    };

    environment = lib.mkOption {
      type = lib.types.attrsOf lib.types.str;
      default = { };
      example = {
        SUPABASE_URL = "https://project-ref.supabase.co";
        FRONTEND_URL = "https://app.example.org";
        OP_CLIENT_WALLET_ADDRESS = "https://ilp.interledger-test.dev/opencircle";
        OP_KEY_ID = "key-id-from-the-wallet";
        DIDIT_WORKFLOW_ID = "00000000-0000-4000-8000-000000000000";
      };
      description = ''
        Public runtime environment variables. Values end up in the Nix store,
        so secrets (${lib.concatStringsSep ", " secretVars}) are refused here.
      '';
    };

    environmentFile = lib.mkOption {
      type = lib.types.nullOr lib.types.path;
      default = null;
      example = "/run/secrets/opencircle-backend.env";
      description = ''
        systemd EnvironmentFile (KEY=value lines) with the secrets and any
        other variable not set in `environment`. Required unless `environment`
        covers every variable the API needs: ${lib.concatStringsSep ", " requiredVars}.
        Must not live in the Nix store.
      '';
    };

    openFirewall = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = "Open `port` in the firewall and expose the API to the network.";
    };
  };

  config = lib.mkIf cfg.enable {
    assertions = [
      {
        assertion = cfg.environmentFile != null || missing == [ ];
        message = "services.opencircle-backend: set `environmentFile`, or provide ${lib.concatStringsSep ", " missing} in `environment`.";
      }
      {
        assertion = leaked == [ ];
        message = "services.opencircle-backend.environment must not contain secrets (${lib.concatStringsSep ", " leaked}); put them in `environmentFile`.";
      }
    ];

    systemd.services.opencircle-backend = {
      description = "OpenCircle API";
      wantedBy = [ "multi-user.target" ];
      after = [ "network.target" ];

      environment = {
        PORT = toString cfg.port;
      }
      // cfg.environment;

      serviceConfig = import ./hardening.nix // {
        ExecStart = lib.getExe cfg.package;
        EnvironmentFile = lib.optional (cfg.environmentFile != null) cfg.environmentFile;
        # The wrapper loads ./.env when present; point cwd at an empty dir so
        # only systemd-provided configuration applies.
        WorkingDirectory = "/var/empty";
      };
    };

    networking.firewall.allowedTCPPorts = lib.mkIf cfg.openFirewall [ cfg.port ];
  };
}
