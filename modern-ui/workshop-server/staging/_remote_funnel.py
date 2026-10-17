from __future__ import annotations

import os
import sys
import time
from pathlib import Path

import paramiko

HOST = os.environ.get("PROXMOX_HOST", "192.168.10.200")
PASSWORD = os.environ["PROXMOX_PASS"]
LOCAL = Path(__file__).resolve().parent / "install-funnel-proxy.sh"
REMOTE = "/root/zeus-workshop-staging/install-funnel-proxy.sh"


def main() -> int:
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", password=PASSWORD, timeout=30, allow_agent=False, look_for_keys=False)
    c.exec_command("mkdir -p /root/zeus-workshop-staging")[1].channel.recv_exit_status()
    sftp = c.open_sftp()
    sftp.put(str(LOCAL), REMOTE)
    sftp.close()
    c.exec_command(f"sed -i 's/\\r$//' {REMOTE}; chmod +x {REMOTE}")[1].channel.recv_exit_status()
    print("Running install-funnel-proxy.sh", flush=True)
    _i, o, _e = c.exec_command(f"bash {REMOTE}", get_pty=True, timeout=180)
    chan = o.channel
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
    print("EXIT", code, flush=True)
    c.close()
    return code


if __name__ == "__main__":
    raise SystemExit(main())
