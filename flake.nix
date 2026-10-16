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
      packages = forEachSystem (pkgs: {
        hello = pkgs.hello;
        default = pkgs.hello;
      });

      devShells = forEachSystem (pkgs: {
        default = import ./shell.nix { inherit pkgs; };
      });
    };
}
