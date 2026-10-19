import paramiko

HOST = "192.168.10.200"
PASS = "admin1234"
CTS = [250, 251]

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username="root", password=PASS, timeout=15)


def run(cmd: str, timeout: int = 90) -> tuple[int, str, str]:
    _stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    return code, out, err


print("=== service status ===")
for ct in CTS:
    _code, out, _err = run(f"pct exec {ct} -- systemctl is-active zeus-workshop")
    print(f"CT {ct} active: {out.strip()}")

print("\n=== server.mjs hash + size + mtime ===")
for ct in CTS:
    _code, out, _err = run(
        f"pct exec {ct} -- sh -c 'sha256sum /opt/zeus-workshop/server.mjs; "
        f"wc -c /opt/zeus-workshop/server.mjs; "
        f"stat -c %y /opt/zeus-workshop/server.mjs'"
    )
    print(f"CT {ct}:\n{out.strip()}")

print("\n=== schema.sql hash ===")
for ct in CTS:
    _code, out, _err = run(f"pct exec {ct} -- sha256sum /opt/zeus-workshop/schema.sql")
    print(f"CT {ct}: {out.strip()}")

print("\n=== feature greps in server.mjs ===")
patterns = [
    "/letters",
    "admin_removed",
    "sendLetter",
    "ROOM_CAP",
    "TRADE_HOLD",
    "pairing",
    "Secret Santa",
    "handle-available",
    "mission_progress",
    "No King is online",
]
for ct in CTS:
    print(f"-- CT {ct} --")
    for pattern in patterns:
        escaped = pattern.replace("'", "'\\''")
        _code, out, _err = run(
            f"pct exec {ct} -- sh -c \"grep -c '{escaped}' /opt/zeus-workshop/server.mjs || true\""
        )
        print(f"  {pattern}: {out.strip()}")

print("\n=== DB schema markers ===")
sql = (
    "SELECT "
    "(SELECT count(*) FROM information_schema.columns WHERE table_name='profiles' AND column_name='admin_removed') AS admin_removed, "
    "(SELECT count(*) FROM information_schema.tables WHERE table_name='letters') AS letters, "
    "(SELECT count(*) FROM information_schema.tables WHERE table_name='mission_progress') AS missions, "
    "(SELECT count(*) FROM information_schema.columns WHERE table_name='signup_verifications' AND column_name='handle') AS signup_handle, "
    "(SELECT count(*) FROM information_schema.columns WHERE table_name='live_events' AND column_name='pairing') AS pairing_col;"
)
for ct in CTS:
    cmd = (
        f"pct exec {ct} -- bash -lc "
        f"\"set -a; . /etc/zeus-workshop.env; set +a; "
        f"psql \\\"\\$DATABASE_URL\\\" -At -F '|' -c \\\"{sql}\\\"\""
    )
    _code, out, err = run(cmd)
    print(f"CT {ct}: {out.strip() or '(empty)'} err={err.strip()[:180]}")

print("\n=== secret-santa / pairing rows ===")
sql2 = (
    "SELECT id, enabled, pairing, end_at "
    "FROM live_events "
    "WHERE id LIKE 'secret-santa%' OR pairing = 'same-crew' "
    "ORDER BY id;"
)
for ct in CTS:
    cmd = (
        f"pct exec {ct} -- bash -lc "
        f"\"set -a; . /etc/zeus-workshop.env; set +a; "
        f"psql \\\"\\$DATABASE_URL\\\" -At -F '|' -c \\\"{sql2}\\\"\""
    )
    _code, out, err = run(cmd)
    print(f"CT {ct}: {out.strip() or '(none)'} err={err.strip()[:120]}")

print("\n=== letter counts ===")
for ct in CTS:
    cmd = (
        f"pct exec {ct} -- bash -lc "
        f"\"set -a; . /etc/zeus-workshop.env; set +a; "
        f"psql \\\"\\$DATABASE_URL\\\" -At -c 'SELECT count(*) FROM letters;'\""
    )
    _code, out, err = run(cmd)
    print(f"CT {ct} letters: {out.strip()} err={err.strip()[:80]}")

print("\n=== CT resources ===")
for ct in CTS:
    _code, out, _err = run(f"pct config {ct} | egrep 'cores|memory|swap|rootfs|hostname'")
    print(f"CT {ct}:\n{out.strip()}")

print("\n=== env keys (no secrets) ===")
for ct in CTS:
    _code, out, _err = run(
        f"pct exec {ct} -- bash -lc "
        f"\"grep -E '^(NODE_ENV|HOST|PORT|WORKSHOP_ORIGINS|BREVO|SMTP|MAIL)=' /etc/zeus-workshop.env "
        f"| sed 's/=.*/=…/' || true\""
    )
    print(f"CT {ct}:\n{out.strip() or '(none)'}")

client.close()
