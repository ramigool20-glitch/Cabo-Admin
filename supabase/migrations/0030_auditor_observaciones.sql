-- =============================================================
-- Migración 0030: Observaciones del Auditor IA (feed de highlights)
-- =============================================================
-- Guarda lo que el auditor va detectando (de datos REALES) para que
-- el usuario lo revise como feed por gravedad. clave = dedupe.
-- =============================================================

create table if not exists auditor_observaciones (
  id uuid primary key default gen_random_uuid(),
  severidad text not null default 'atencion' check (severidad in ('grave', 'atencion', 'bien')),
  titulo text not null,
  detalle text,
  recomendacion text,
  categoria text,                     -- area/negocio/tema
  clave text unique,                  -- dedupe: misma clave = misma observacion (se refresca)
  datos jsonb,                        -- evidencia: numeros reales que la originaron
  fuente text not null default 'cron' check (fuente in ('cron', 'chat', 'movimiento')),
  estado text not null default 'nueva' check (estado in ('nueva', 'vista', 'archivada', 'resuelta')),
  visto_por uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_auditor_obs_feed on auditor_observaciones(estado, severidad, created_at desc);

alter table auditor_observaciones enable row level security;
create policy "select_autenticado" on auditor_observaciones for select using (usuario_activo());
create policy "write_socio" on auditor_observaciones for all using (usuario_activo()) with check (usuario_activo());
