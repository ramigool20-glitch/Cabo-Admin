-- =============================================================
-- 0049: Logger central + health monitoring
-- Sistema de observabilidad sin romper nada existente.
-- =============================================================

create table if not exists error_log (
  id uuid primary key default gen_random_uuid(),
  level text not null check (level in ('info', 'warn', 'error', 'fatal')),
  source text not null,                    -- ej. "webhook/mp", "venta-actions/crear", "cron/mp-sync"
  message text not null,
  stack text,
  context jsonb,                           -- request, user, datos relevantes
  user_id uuid references profiles(id) on delete set null,
  resuelto boolean default false,          -- admin marca como visto/arreglado
  notificado_push boolean default false,   -- si ya se mandó push a admin
  created_at timestamptz default now()
);

create index if not exists idx_error_log_recent  on error_log(created_at desc);
create index if not exists idx_error_log_level   on error_log(level, created_at desc) where resuelto = false;
create index if not exists idx_error_log_source  on error_log(source, created_at desc);

alter table error_log enable row level security;
drop policy if exists "select_autenticado" on error_log;
drop policy if exists "write_admin" on error_log;
create policy "select_autenticado" on error_log for select using (usuario_activo());
create policy "write_admin" on error_log for all using (usuario_activo()) with check (usuario_activo());

-- View para ver errores no resueltos por fuente
create or replace view error_log_resumen as
select
  source,
  level,
  count(*) as total,
  count(*) filter (where resuelto = false) as pendientes,
  max(created_at) as ultimo,
  min(created_at) as primero
from error_log
where created_at > now() - interval '7 days'
group by source, level
order by ultimo desc;
