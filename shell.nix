{
  pkgs,
  ...
}:

pkgs.mkShell {
  packages = with pkgs; [
    claude-code
  ];
}
