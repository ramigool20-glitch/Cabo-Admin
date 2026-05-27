-- =============================================================
-- Migración 0014: Radar — análisis IA de noticias relevantes para Cabo
-- =============================================================

create table if not exists radar_insights (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('noticia', 'tendencia', 'riesgo', 'oportunidad', 'evento_local')),
  titulo text not null,
  resumen text not null,
  fuente text,                                   -- URL o nombre del medio
  fuente_url text,                               -- URL específica
  impacto text default 'media' check (impacto in ('alta', 'media', 'baja')),
  aplica_a text[] default '{}',                  -- ['farmacia', 'consultorio', 'rancho_mccoy', 'general']
  recomendacion text,                            -- qué deberían hacer
  query_origen text,                             -- qué query disparó este insight
  fecha_evento date,                             -- si aplica (ej. tormenta tropical el día X)
  modelo_ia text default 'gpt-4o',
  visto boolean default false,
  visto_por uuid references profiles(id),
  visto_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_radar_fecha   on radar_insights(created_at desc);
create index if not exists idx_radar_impacto on radar_insights(impacto);
create index if not exists idx_radar_visto   on radar_insights(visto);

alter table radar_insights enable row level security;

drop policy if exists "select_autenticado" on radar_insights;
drop policy if exists "write_socio"        on radar_insights;

create policy "select_autenticado" on radar_insights for select using (usuario_activo());
create policy "write_socio"        on radar_insights for all    using (usuario_activo()) with check (usuario_activo());

-- Bitácora de ejecuciones del radar para evitar spam y monitoreo
create table if not exists radar_runs (
  id uuid primary key default gen_random_uuid(),
  disparado_por text not null,                   -- 'cron' o 'manual'
  insights_creados integer default 0,
  error text,
  created_at timestamptz default now()
);

create index if not exists idx_radar_runs_fecha on radar_runs(created_at desc);

alter table radar_runs enable row level security;

drop policy if exists "select_autenticado" on radar_runs;
drop policy if exists "write_socio"        on radar_runs;

create policy "select_autenticado" on radar_runs for select using (usuario_activo());
create policy "write_socio"        on radar_runs for all    using (usuario_activo()) with check (usuario_activo());
