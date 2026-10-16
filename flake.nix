{
  description = "Interledger Hackathon Medellin 2026";

  inputs = {
    nixpkgs.url = "https://channels.nixos.org/nixpkgs-unstable/nixexprs.tar.zst";
  };

  outputs = inputs:
    let
      systems = builtins.attrNames inputs.nixpkgs.legacyPackages;
      forEachSystem = f: builtins.listToAttrs (map (system: {
        name = system;
        value = f (import inputs.nixpkgs {
          inherit system;
          config.allowUnfree = true;
        });
      }) systems);
    in {
      packages = forEachSystem (pkgs: rec {
        # `nix build .#frontend` → result/bin/opencircle-frontend (Next.js standalone server).
        # Override to bake in public Supabase config:
        #   frontend.override { supabaseUrl = "https://x.supabase.co"; supabasePublishableKey = "sb_publishable_..."; }
        frontend = pkgs.callPackage ./frontend/package.nix { };
        # `nix build .#backend` → result/bin/opencircle-backend (Express API).
        # Runtime config comes from the environment (see backend/.env.example).
        backend = pkgs.callPackage ./backend/package.nix { };
        default = frontend;
      });

      apps = forEachSystem (pkgs: rec {
        # `nix run .#frontend` serves on http://localhost:3000 (PORT/HOSTNAME override).
        frontend = {
          type = "app";
          program = pkgs.lib.getExe inputs.self.packages.${pkgs.stdenv.hostPlatform.system}.frontend;
        };
        # `nix run .#backend` with PORT, DATABASE_URL and SUPABASE_URL exported.
        backend = {
          type = "app";
          program = pkgs.lib.getExe inputs.self.packages.${pkgs.stdenv.hostPlatform.system}.backend;
        };
        default = frontend;
      });

      devShells = forEachSystem (pkgs: {
        default = import ./shell.nix { inherit pkgs; };
      });

      # NixOS: `imports = [ opencircle.nixosModules.default ];` then enable
      # services.opencircle-frontend / services.opencircle-backend. The package
      # defaults to this flake's build for the host system.
      nixosModules = {
        frontend = { pkgs, lib, ... }: {
          imports = [ ./nix/modules/frontend.nix ];
          services.opencircle-frontend.package =
            lib.mkDefault inputs.self.packages.${pkgs.stdenv.hostPlatform.system}.frontend;
        };
        backend = { pkgs, lib, ... }: {
          imports = [ ./nix/modules/backend.nix ];
          services.opencircle-backend.package =
            lib.mkDefault inputs.self.packages.${pkgs.stdenv.hostPlatform.system}.backend;
        };
        default = {
          imports = [ inputs.self.nixosModules.frontend inputs.self.nixosModules.backend ];
        };
      };

      # `nix flake check` / `nix build .#checks.<system>.services`: VM test of both modules.
      checks = forEachSystem (pkgs: pkgs.lib.optionalAttrs pkgs.stdenv.hostPlatform.isLinux {
        services = pkgs.testers.runNixOSTest (import ./nix/tests/services.nix { inherit (inputs) self; });
      });
    };
}
