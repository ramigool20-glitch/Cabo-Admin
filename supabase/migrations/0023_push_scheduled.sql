create table if not exists push_scheduled (
  id uuid primary key default gen_random_uuid(),
  profile_ids uuid[] not null,
  title text not null,
  body text not null,
  url text,
  tag text,
  fire_at timestamptz not null,
  sent boolean default false,
  sent_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists idx_push_sched_fire on push_scheduled(fire_at) where sent = false;
create index if not exists idx_push_sched_sent on push_scheduled(sent);

alter table push_scheduled enable row level security;
drop policy if exists "select_autenticado" on push_scheduled;
drop policy if exists "write_admin" on push_scheduled;
create policy "select_autenticado" on push_scheduled for select using (usuario_activo());
create policy "write_admin" on push_scheduled for all using (usuario_activo()) with check (usuario_activo());
