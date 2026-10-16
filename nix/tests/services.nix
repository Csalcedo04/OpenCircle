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
        # Public values go in `environment`; the fake secrets below live in an
        # EnvironmentFile, exercising the same split a real host would use.
        environment = {
          SUPABASE_URL = "https://example.supabase.co";
          FRONTEND_URL = "http://127.0.0.1:3000";
          OP_CLIENT_WALLET_ADDRESS = "https://ilp.interledger-test.dev/opencircle-test";
          OP_KEY_ID = "test-key";
          DIDIT_WORKFLOW_ID = "00000000-0000-4000-8000-000000000000";
        };
        environmentFile = "/etc/opencircle-backend.env";
      };
      # Throwaway test fixtures, not credentials: the database is unreachable
      # (the API connects lazily), the Ed25519 key was generated for this test
      # only, and the token key is 32 repeated bytes.
      environment.etc."opencircle-backend.env".text = ''
        DATABASE_URL=postgresql://user:pass@127.0.0.1:1/postgres
        OP_PRIVATE_KEY=MC4CAQAwBQYDK2VwBCIEICNLtP42IEqNnpwJfqzdYyAahp6MyM79K4SVeOXl8Fqv
        GRANT_TOKEN_KEY=BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=
        DIDIT_API_KEY=test-api-key
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
