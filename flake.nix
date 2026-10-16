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
        default = frontend;
      });

      apps = forEachSystem (pkgs: rec {
        # `nix run .#frontend` serves on http://localhost:3000 (PORT/HOSTNAME override).
        frontend = {
          type = "app";
          program = pkgs.lib.getExe inputs.self.packages.${pkgs.stdenv.hostPlatform.system}.frontend;
        };
        default = frontend;
      });

      devShells = forEachSystem (pkgs: {
        default = import ./shell.nix { inherit pkgs; };
      });
    };
}
