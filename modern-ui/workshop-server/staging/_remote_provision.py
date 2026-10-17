"""One-shot: upload scripts and provision CT 251 on Proxmox.

Requires env PROXMOX_PASS (and optional PROXMOX_HOST). Do not commit passwords.
"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

import paramiko

HOST = os.environ.get("PROXMOX_HOST", "192.168.10.200")
USER = os.environ.get("PROXMOX_USER", "root")
PASSWORD = os.environ["PROXMOX_PASS"]
STAGING = Path(__file__).resolve().parent
REMOTE = "/root/zeus-workshop-staging"


def main() -> int:
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASSWORD, timeout=30, allow_agent=False, look_for_keys=False)

    def run(cmd: str, timeout: int = 120) -> tuple[int, str]:
        _stdin, stdout, stderr = c.exec_command(cmd, timeout=timeout)
        out = stdout.read().decode("utf-8", "replace")
        err = stderr.read().decode("utf-8", "replace")
        code = stdout.channel.recv_exit_status()
        return code, out + err

    code, st = run("pct status 251 2>/dev/null || true")
    print("251 before:", st.strip() or "absent")
    if "status:" in st:
        print("Destroying incomplete CT 251...")
        run("pct stop 251 || true", timeout=120)
        run("pct destroy 251 --purge 1", timeout=300)

    run(f"rm -rf {REMOTE} && mkdir -p {REMOTE}/sql")
    sftp = c.open_sftp()
    for path in STAGING.rglob("*"):
        if not path.is_file():
            continue
        if path.name.startswith("_") or path.name == ".env.example":
            continue
        rel = path.relative_to(STAGING).as_posix()
        rpath = f"{REMOTE}/{rel}"
        parent = "/".join(rpath.split("/")[:-1])
        run(f"mkdir -p {parent}")
        sftp.put(str(path), rpath)
        print("uploaded", rel)
    sftp.close()
    run(f"sed -i 's/\\r$//' {REMOTE}/*.sh {REMOTE}/sql/*.sql; chmod +x {REMOTE}/provision-ct.sh {REMOTE}/ops.sh")

    print("Running provision-ct.sh ...", flush=True)
    _stdin, stdout, stderr = c.exec_command(f"bash {REMOTE}/provision-ct.sh", get_pty=True, timeout=900)
    chan = stdout.channel
    while True:
        if chan.recv_ready():
            sys.stdout.write(chan.recv(4096).decode("utf-8", "replace"))
            sys.stdout.flush()
        if chan.recv_stderr_ready():
            sys.stderr.write(chan.recv_stderr(4096).decode("utf-8", "replace"))
            sys.stderr.flush()
        if chan.exit_status_ready() and not chan.recv_ready() and not chan.recv_stderr_ready():
            break
        time.sleep(0.2)
    code = chan.recv_exit_status()
    print("\nEXIT", code, flush=True)

    if code == 0:
        _c2, health = run("curl -fsS --connect-timeout 5 http://192.168.10.251:8787/health || true")
        print("LAN health from host:", health.strip())
        _c3, listing = run("pct list")
        print(listing)

    c.close()
    return code


if __name__ == "__main__":
    raise SystemExit(main())
