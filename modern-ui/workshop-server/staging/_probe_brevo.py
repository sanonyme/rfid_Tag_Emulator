from __future__ import annotations

import os
import paramiko

HOST = os.environ.get("PROXMOX_HOST", "192.168.10.200")
PASSWORD = os.environ["PROXMOX_PASS"]

PROBE = r"""#!/bin/bash
set -euo pipefail
set -a
[ -f /etc/zeus-workshop.env ] && . /etc/zeus-workshop.env
[ -f /etc/zeus-workshop-brevo.env ] && . /etc/zeus-workshop-brevo.env
set +a
echo "KEY_LEN=${#BREVO_API_KEY}"
echo "FROM_RAW=[$WORKSHOP_EMAIL_FROM]"
FROM="${WORKSHOP_EMAIL_FROM%\"}"
FROM="${FROM#\"}"
FROM="${FROM%\'}"
FROM="${FROM#\'}"
echo "FROM_STRIPPED=[$FROM]"
if [ -z "${BREVO_API_KEY:-}" ] || [ -z "$FROM" ]; then
  echo 'MISSING_ENV'
  exit 2
fi
CODE=$(curl -sS -o /tmp/brevo-account.json -w '%{http_code}' -m 15 \
  -H "api-key: ${BREVO_API_KEY}" -H 'Accept: application/json' \
  https://api.brevo.com/v3/account || echo curl_fail)
echo "ACCOUNT_HTTP=$CODE"
python3 - <<'PY'
import json
try:
  d=json.load(open('/tmp/brevo-account.json'))
  print('ACCOUNT_EMAIL', d.get('email'))
  if 'message' in d: print('ACCOUNT_MSG', str(d.get('message'))[:200])
  if 'code' in d: print('ACCOUNT_CODE', d.get('code'))
except Exception as e:
  print('ACCOUNT_PARSE', e)
PY
export BREVO_API_KEY FROM
python3 - <<'PY'
import json, os, urllib.request
body = json.dumps({
  "sender": {"email": os.environ["FROM"], "name": "Zeus Workshop"},
  "to": [{"email": os.environ["FROM"]}],
  "subject": "Zeus Workshop email probe",
  "textContent": "Probe only. Ignore.",
}).encode()
req = urllib.request.Request(
  "https://api.brevo.com/v3/smtp/email",
  data=body,
  headers={
    "api-key": os.environ["BREVO_API_KEY"],
    "Content-Type": "application/json",
    "Accept": "application/json",
  },
  method="POST",
)
try:
  with urllib.request.urlopen(req, timeout=15) as res:
    raw = res.read().decode()
    print("SEND_HTTP", res.status)
    d = json.loads(raw)
except Exception as e:
    print("SEND_FAIL", type(e).__name__, str(e)[:300])
    if hasattr(e, "read"):
      try:
        d = json.loads(e.read().decode())
        print("SEND_HTTP", getattr(e, "code", "?"))
      except Exception:
        raise SystemExit(0)
    else:
      raise SystemExit(0)
for k in ("messageId", "message", "code", "error"):
  if k in d:
    print("SEND_" + k.upper(), str(d[k])[:240])
PY
"""


def main() -> None:
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", password=PASSWORD, timeout=20, allow_agent=False, look_for_keys=False)
    sftp = c.open_sftp()
    with sftp.file("/tmp/probe-brevo.sh", "w") as f:
        f.write(PROBE)
    sftp.close()
    for ct in (250, 251):
        print(f"######## CT {ct}")
        _, o, e = c.exec_command(
            f"pct push {ct} /tmp/probe-brevo.sh /tmp/probe-brevo.sh && pct exec {ct} -- bash /tmp/probe-brevo.sh",
            timeout=90,
        )
        print((o.read() + e.read()).decode("utf-8", "replace"))
    c.close()


if __name__ == "__main__":
    main()
