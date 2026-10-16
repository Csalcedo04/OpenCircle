# services.opencircle-frontend: the Next.js web app as a systemd service.
#
# NEXT_PUBLIC_* values are baked in at build time, so set them on the package
# (`package = frontend.override { nextPublicEnv = { ... }; }`), not here.
# Runtime secrets (server-only Supabase key) go in `environmentFile`.
{ config, lib, ... }:
let
  cfg = config.services.opencircle-frontend;
in
{
  options.services.opencircle-frontend = {
    enable = lib.mkEnableOption "the OpenCircle web app (Next.js)";

    package = lib.mkOption {
      type = lib.types.package;
      description = "The opencircle-frontend package to run (flake output `packages.<system>.frontend`).";
    };

    address = lib.mkOption {
      type = lib.types.str;
      default = "127.0.0.1";
      description = "Address to bind. Keep it local and put a reverse proxy (TLS) in front.";
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 3000;
      description = "TCP port to listen on.";
    };

    environment = lib.mkOption {
      type = lib.types.attrsOf lib.types.str;
      default = { };
      description = "Non-secret runtime environment variables. Values end up in the Nix store.";
    };

    environmentFile = lib.mkOption {
      type = lib.types.nullOr lib.types.path;
      default = null;
      example = "/run/secrets/opencircle-frontend.env";
      description = "systemd EnvironmentFile with secrets, in KEY=value form. Must not live in the Nix store.";
    };

    openFirewall = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = "Open `port` in the firewall. Only useful when `address` is not loopback.";
    };
  };

  config = lib.mkIf cfg.enable {
    systemd.services.opencircle-frontend = {
      description = "OpenCircle web app";
      wantedBy = [ "multi-user.target" ];
      after = [ "network.target" ];

      environment = {
        PORT = toString cfg.port;
        HOSTNAME = cfg.address;
      }
      // cfg.environment;

      serviceConfig = import ./hardening.nix // {
        ExecStart = lib.getExe cfg.package;
        EnvironmentFile = lib.optional (cfg.environmentFile != null) cfg.environmentFile;
      };
    };

    networking.firewall.allowedTCPPorts = lib.mkIf cfg.openFirewall [ cfg.port ];
  };
}
