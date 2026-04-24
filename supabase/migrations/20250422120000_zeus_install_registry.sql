-- Zeus install registry: one row per machine_id (upsert on each call from the Edge Function).

create table if not exists public.zeus_installs (
  machine_id text primary key,
  mac_address text,
  app_version text not null,
  os text not null,
  arch text not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  seen_count integer not null default 1
);

create index if not exists idx_zeus_installs_last_seen on public.zeus_installs (last_seen desc);
create index if not exists idx_zeus_installs_app_version on public.zeus_installs (app_version);

alter table public.zeus_installs enable row level security;

-- Inserts/updates go only through register_zeus_install (service role / Edge Function).
-- No public policies: anon cannot read or write the table.

create or replace function public.register_zeus_install(
  p_machine_id text,
  p_mac_address text,
  p_app_version text,
  p_os text,
  p_arch text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if length(p_machine_id) < 4 or length(p_machine_id) > 256 then
    raise exception 'invalid machineId';
  end if;
  insert into public.zeus_installs (machine_id, mac_address, app_version, os, arch, first_seen, last_seen, seen_count)
  values (p_machine_id, nullif(trim(p_mac_address), ''), p_app_version, p_os, p_arch, now(), now(), 1)
  on conflict (machine_id) do update set
    mac_address = excluded.mac_address,
    app_version = excluded.app_version,
    os = excluded.os,
    arch = excluded.arch,
    last_seen = now(),
    seen_count = public.zeus_installs.seen_count + 1;
end;
$$;

revoke all on public.zeus_installs from public;
grant all on public.zeus_installs to postgres;

revoke all on function public.register_zeus_install(text, text, text, text, text) from public;
grant execute on function public.register_zeus_install(text, text, text, text, text) to service_role;
