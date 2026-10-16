# NixOS VM test: both services start under the hardened units and answer HTTP.
# Run with `nix build .#checks.x86_64-linux.services` (needs KVM).
{ self }:
{
  name = "opencircle-services";

  nodes.machine =
    { pkgs, ... }:
    {
      imports = [ self.nixosModules.default ];

      services.opencircle-frontend.enable = true;

      services.opencircle-backend = {
        enable = true;
        environment.SUPABASE_URL = "https://example.supabase.co";
        # Fake credentials: the API only connects lazily, on the first query.
        environmentFile = "/etc/opencircle-backend.env";
      };
      environment.etc."opencircle-backend.env".text = ''
        DATABASE_URL=postgresql://user:pass@127.0.0.1:1/postgres
      '';

      environment.systemPackages = [ pkgs.curl ];
    };

  testScript = ''
    machine.wait_for_unit("opencircle-frontend.service")
    machine.wait_for_unit("opencircle-backend.service")
    machine.wait_for_open_port(3000)
    machine.wait_for_open_port(3001)

    # Capture bodies and status codes first: piping curl into `grep -q` makes
    # curl fail with exit 23 when grep closes the pipe early.
    def status(url):
        return machine.succeed(f"curl -sS -o /dev/null -w '%{{http_code}}' {url}").strip()

    with subtest("frontend serves the app"):
        assert "OpenCircle" in machine.succeed("curl -fsS http://127.0.0.1:3000/es")
        assert status("http://127.0.0.1:3000/") == "307"

    with subtest("backend answers health and 404"):
        assert '"status":"ok"' in machine.succeed("curl -fsS http://127.0.0.1:3001/api/health")
        assert status("http://127.0.0.1:3001/api/nope") == "404"

    with subtest("units run unprivileged"):
        assert "opencircle-backend" in machine.succeed("systemctl show -p User opencircle-backend.service")
        assert "yes" in machine.succeed("systemctl show -p DynamicUser opencircle-frontend.service")
  '';
}
