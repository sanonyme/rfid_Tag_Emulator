# How to Run Zeus (Modern UI)

Zeus is an Electron desktop app. TCP, SFTP, MySQL, and Edge REST all run in the **Electron main process** — you do not need the legacy Java UI for normal use.

## Development

```bash
cd modern-ui
npm install
npm run electron:dev
```

Copy `.env.example` to `.env` and set `VITE_ALE_USERNAME` / `VITE_ALE_PASSWORD` if you use the Fixed tab stations or Edge tab.

Use `npm run dev` only for browser/mobile UI mock testing (no real TCP/SFTP).

## Production build

```bash
cd modern-ui
npm run electron:build
```

Installers land in `modern-ui/dist-app/`.

## What each layer does

| Layer | Role |
|-------|------|
| `src/` | React UI |
| `electron/main.ts` | IPC handlers, window management |
| `electron/tcp-handler.ts` | Fixed reader, handheld server, OCR TCP |
| `electron/sftp-handler.ts` | SFTP sessions |
| `electron/db-handler.ts` | MySQL admin tab |

## Legacy Java UI

The `legacy-java/` folder is deprecated. See root `README.md` if you still need it.

## Troubleshooting

**"Electron API not available"** — Run via `npm run electron:dev`, not `npm run dev` alone.

**Connection refused** — Check host/port, firewall, and that the Edge appliance or reader is reachable.

**Missing logical devices / Edge auth** — Verify `VITE_ALE_*` in `.env` and restart the dev server after changes.
