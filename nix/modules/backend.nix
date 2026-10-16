# services.opencircle-backend: the Express API as a systemd service.
#
# The API needs DATABASE_URL and SUPABASE_URL (see backend/.env.example).
# DATABASE_URL carries a password, so it belongs in `environmentFile`;
# SUPABASE_URL is public and can go in `environment`.
{ config, lib, ... }:
let
  cfg = config.services.opencircle-backend;
  provides = name: cfg.environmentFile != null || builtins.hasAttr name cfg.environment;
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
      };
      description = "Non-secret runtime environment variables. Values end up in the Nix store.";
    };

    environmentFile = lib.mkOption {
      type = lib.types.nullOr lib.types.path;
      default = null;
      example = "/run/secrets/opencircle-backend.env";
      description = "systemd EnvironmentFile with secrets such as DATABASE_URL, in KEY=value form. Must not live in the Nix store.";
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
        assertion = provides "DATABASE_URL" && provides "SUPABASE_URL";
        message = "services.opencircle-backend needs DATABASE_URL and SUPABASE_URL, via `environmentFile` or `environment`.";
      }
      {
        assertion = !(builtins.hasAttr "DATABASE_URL" cfg.environment);
        message = "services.opencircle-backend.environment.DATABASE_URL would put the database password in the Nix store; use `environmentFile`.";
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
