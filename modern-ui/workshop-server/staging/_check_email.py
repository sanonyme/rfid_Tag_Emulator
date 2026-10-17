from __future__ import annotations

import os
import paramiko

HOST = os.environ.get("PROXMOX_HOST", "192.168.10.200")
PASSWORD = os.environ["PROXMOX_PASS"]

REMOTE_SCRIPT = r"""#!/bin/bash
set -euo pipefail
for f in /etc/zeus-workshop.env /etc/zeus-workshop-brevo.env; do
  if [ -f "$f" ]; then
    echo "FILE $f"
    grep -E '^(BREVO_API_KEY|WORKSHOP_EMAIL_FROM)=' "$f" \
      | sed -E 's/^(BREVO_API_KEY=).+/\1SET/; s/^(WORKSHOP_EMAIL_FROM=)(.+)/\1\2/' || true
  else
    echo "MISSING $f"
  fi
done
echo '--- unit ---'
systemctl cat zeus-workshop 2>/dev/null | grep -E 'Environment|EnvironmentFile' || true
echo '--- recent logs ---'
journalctl -u zeus-workshop -n 80 --no-pager || true
"""


def run(c: paramiko.SSHClient, cmd: str) -> str:
    print("====", cmd[:120])
    _, o, e = c.exec_command(cmd, timeout=90)
    out = (o.read() + e.read()).decode("utf-8", "replace")
    print(out or "(empty)")
    return out


def main() -> None:
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", password=PASSWORD, timeout=20, allow_agent=False, look_for_keys=False)
    sftp = c.open_sftp()
    with sftp.file("/tmp/check-workshop-email.sh", "w") as f:
        f.write(REMOTE_SCRIPT)
    sftp.close()
    run(c, "chmod +x /tmp/check-workshop-email.sh")
    for ct in (250, 251):
        print(f"######## CT {ct}")
        run(c, f"pct push {ct} /tmp/check-workshop-email.sh /tmp/check-workshop-email.sh")
        run(c, f"pct exec {ct} -- bash /tmp/check-workshop-email.sh")
    c.close()


if __name__ == "__main__":
    main()
