{
  pkgs,
  ...
}:

pkgs.mkShell {
  packages = with pkgs; [
    claude-code
    # Same toolchain the Nix package (frontend/package.nix) builds with.
    nodejs_22
    pnpm_10
  ];
}
