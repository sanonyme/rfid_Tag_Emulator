# Zeus install registry on Supabase

The desktop app only sends data to a URL **you** configure: the **Supabase Edge Function** below, which writes to **your** Postgres. There is no other product telemetry; app updates are only checked if the user opens **Settings** and clicks **Check for updates** (no background update polling).

## Do this in order (checklist)

1. [ ] **Supabase account** — [supabase.com](https://supabase.com) → **New project** (wait until ready). Note **Project ref** (Settings → General, e.g. `abcdxyz`).
2. [ ] **Run the SQL** — Dashboard **SQL** → New query → paste all of `migrations/20250422120000_zeus_install_registry.sql` from this folder → **Run**.
3. [ ] **Deploy the Edge Function** — Install [Supabase CLI](https://supabase.com/docs/guides/cli), then from the repo root: `supabase login` → `supabase link --project-ref YOUR_PROJECT_REF` → `supabase functions deploy register-install` (or use the dashboard to create function `register-install` and paste `functions/register-install/index.ts`).
4. [ ] **Secret (recommended)** — Dashboard **Edge Functions → Secrets** (or `supabase secrets set REGISTRY_TOKEN=your-long-random-string`).
5. [ ] **Zeus `.env`** in `modern-ui` (or `.exe` folder when packaged):
   - `INSTALL_REGISTRY_URL=https://YOUR_PROJECT_REF.supabase.co/functions/v1/register-install`
   - `REGISTRY_TOKEN=...` (same as step 4)
6. [ ] **Restart Zeus** → **Settings → Install registry** → **Send now** → confirm a row in **Table Editor** → `zeus_installs`.

The Zeus app sends:

```json
{
  "machineId": "...",
  "macAddress": "aa:bb:cc:dd:ee:ff",
  "version": "8.0.0",
  "os": "win32",
  "arch": "x64"
}
```

---

## Step 1 — Create a Supabase project

1. Go to [https://supabase.com](https://supabase.com) and sign in.
2. **New project** → pick organization, name, database password, region.
3. Wait until the project is **ready**.
4. In the dashboard, open **Project Settings** (gear) → **API** and note:
   - **Project URL** — looks like `https://xxxxxxxxxxxxx.supabase.co`
   - You do **not** need to put the service role or anon key in the Zeus app; the Edge Function runs on Supabase and uses the service role there automatically.

---

## Step 2 — Create the table and RPC (database)

**Option A — SQL Editor (simplest)**  

1. In Supabase: **SQL** → **New query**.
2. Copy the full contents of this file in the repo:  
   `supabase/migrations/20250422120000_zeus_install_registry.sql`
3. **Run** the query. You should see no errors.

**Option B — Supabase CLI**  

1. Install the [Supabase CLI](https://supabase.com/docs/guides/cli).
2. From the **repo root**: `supabase link --project-ref YOUR_PROJECT_REF`
3. `supabase db push` (if you use migrations from this folder).

This creates the table `public.zeus_installs` and the function `public.register_zeus_install(...)` (used only by the Edge Function).

---

## Step 3 — Deploy the Edge Function

The function in `supabase/functions/register-install/` receives the same JSON as the app and calls `public.register_zeus_install` in Postgres.

1. Install Supabase CLI (if you did not in step 2).
2. Log in: `supabase login`
3. Link the project:  
   `supabase link --project-ref YOUR_PROJECT_REF`  
   (find **Project ref** under **Project Settings → General**.)

4. From the **repository root** (folder that contains `supabase/`):

   ```bash
   supabase functions deploy register-install --no-verify-jwt
   ```

   Use `--no-verify-jwt` so the **Zeus** app is not required to send a Supabase user JWT. You can still require your own `REGISTRY_TOKEN` (next step).

5. Your function URL is:

   `https://YOUR_PROJECT_REF.supabase.co/functions/v1/register-install`

   Test with `curl` (optional):

   ```bash
   curl -i -X POST "https://YOUR_PROJECT_REF.supabase.co/functions/v1/register-install" \
     -H "Content-Type: application/json" \
     -d '{"machineId":"test-1234","macAddress":"00:11:22:33:44:55","version":"8.0.0","os":"win32","arch":"x64"}'
   ```

   Expect `200` and `{"ok":true,...}`.

---

## Step 4 — (Recommended) Set a shared secret

So only **your** app can call the function:

1. Pick a long random string (e.g. from a password manager).
2. In Supabase dashboard: **Project Settings → Edge Functions → Secrets** (or CLI):

   ```bash
   supabase secrets set REGISTRY_TOKEN=your-long-random-secret
   ```

3. The Edge Function file checks `REGISTRY_TOKEN` and expects:

   `Authorization: Bearer your-long-random-secret`

4. The Zeus app must use the **same** value in `REGISTRY_TOKEN` in its `.env` (next step).

The repo’s Edge Function code reads `Deno.env.get('REGISTRY_TOKEN')` after you set the secret. No code change is needed.

---

## Step 5 — Point the Zeus app at Supabase

In **`modern-ui/.env`** (or a `.env` file **next to the installed `.exe`**, which the app already loads):

```env
INSTALL_REGISTRY_URL=https://YOUR_PROJECT_REF.supabase.co/functions/v1/register-install
REGISTRY_TOKEN=your-long-random-secret
```

Restart the app. Under **Settings → Install registry** you should see a successful **Send now** and rows appearing in **Table Editor** → `zeus_installs`.

---

## Viewing and querying data

- **Table Editor**: **Database → Tables → `zeus_installs`**
- **SQL**, for example:

  ```sql
  select * from public.zeus_installs order by last_seen desc limit 100;
  ```

---

## Troubleshooting

| Symptom | What to check |
|--------|----------------|
| 401 from function | `REGISTRY_TOKEN` in Supabase secrets matches `REGISTRY_TOKEN` in the app `.env` (including `Bearer` only in the app — the app adds `Authorization: Bearer …` automatically). |
| 500 from function | Re-run the migration SQL; check **Edge Functions → Logs** in the dashboard. |
| App says URL not set | `INSTALL_REGISTRY_URL` is set and the app was **restarted**; for packaged builds, put `.env` next to the executable. |
| CORS in browser | The desktop app uses Electron **main** process `fetch` — CORS does not apply. If you test from a browser, the function includes permissive CORS headers. |
