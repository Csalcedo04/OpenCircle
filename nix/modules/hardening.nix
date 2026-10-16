# systemd hardening shared by the OpenCircle services. Both run Node.js, so
# MemoryDenyWriteExecute stays off (V8 JIT) and only network sockets are allowed.
{
  DynamicUser = true;
  Restart = "on-failure";
  RestartSec = 5;
  UMask = "0077";

  NoNewPrivileges = true;
  CapabilityBoundingSet = "";
  PrivateTmp = true;
  PrivateDevices = true;
  PrivateUsers = true;
  ProtectSystem = "strict";
  ProtectHome = true;
  ProtectClock = true;
  ProtectHostname = true;
  ProtectProc = "invisible";
  ProtectControlGroups = true;
  ProtectKernelLogs = true;
  ProtectKernelModules = true;
  ProtectKernelTunables = true;
  RestrictAddressFamilies = [ "AF_INET" "AF_INET6" "AF_UNIX" ];
  RestrictNamespaces = true;
  RestrictRealtime = true;
  RestrictSUIDSGID = true;
  LockPersonality = true;
  SystemCallArchitectures = "native";
  SystemCallFilter = [ "@system-service" "~@privileged" "~@resources" ];
}
