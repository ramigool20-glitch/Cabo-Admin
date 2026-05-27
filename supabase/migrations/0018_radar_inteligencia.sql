-- =============================================================
-- Migración 0018: Radar inteligencia (noticias + espionaje ads)
-- =============================================================
-- Agrega:
--  · Cache de noticias frescas de Google News RSS
--  · Snapshots de ads detectados por competidor (para diff)
--  · Score de amenaza por competidor (IA)
--  · Keywords de búsqueda por negocio (para Meta Ad Library)
--  · Vinculación competidor ↔ negocio (no solo por dominio string)
-- =============================================================

-- 1) Cache de noticias frescas (RSS Google News + APIs futuras)
create table if not exists radar_noticias (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  resumen text,
  url text not null,
  fuente text,                       -- nombre del medio (CNN, El Sudcaliforniano, etc)
  fuente_logo_url text,
  imagen_url text,
  publicada_at timestamptz,          -- cuándo se publicó la noticia
  query_origen text not null,        -- qué query la trajo
  aplica_a text[],                   -- ['cabo', 'farmacia', 'turismo']
  fetched_at timestamptz default now(),
  vista boolean default false,
  vista_por uuid references profiles(id),
  unique (url)
);

create index if not exists idx_noticias_fetched on radar_noticias(fetched_at desc);
create index if not exists idx_noticias_publicada on radar_noticias(publicada_at desc);
create index if not exists idx_noticias_aplica on radar_noticias using gin(aplica_a);

alter table radar_noticias enable row level security;
drop policy if exists "select_autenticado" on radar_noticias;
drop policy if exists "write_admin"        on radar_noticias;
create policy "select_autenticado" on radar_noticias for select using (usuario_activo());
create policy "write_admin"        on radar_noticias for all    using (usuario_activo()) with check (usuario_activo());

-- 2) Keywords por negocio (para búsqueda de ads y noticias)
alter table negocios
  add column if not exists keywords_busqueda text;
  -- formato: 'tequila, mezcal artesanal, regalo cabo' separado por comas

-- 3) Competidor: score amenaza + análisis IA + última revisión
alter table radar_competidores
  add column if not exists negocio_id uuid references negocios(id),
  add column if not exists score_amenaza int check (score_amenaza between 1 and 10),
  add column if not exists score_razon text,                  -- explicación corta del score
  add column if not exists score_analisis_at timestamptz,
  add column if not exists keywords_match text,               -- keywords donde aparece
  add column if not exists ultima_revision_at timestamptz,
  add column if not exists pagina_fb text,                    -- handle de FB Page para Meta API
  add column if not exists pagina_ig text;

create index if not exists idx_radar_comp_negocio on radar_competidores(negocio_id);
create index if not exists idx_radar_comp_score   on radar_competidores(score_amenaza desc);

-- 4) Snapshot de ads por competidor (para detectar nuevos)
create table if not exists radar_ads_snapshots (
  id uuid primary key default gen_random_uuid(),
  competidor_id uuid references radar_competidores(id) on delete cascade,
  ad_id text not null,               -- id único del anuncio (ad_archive_id de Meta)
  plataforma text default 'meta',
  page_name text,
  page_id text,
  ad_creative_body text,             -- texto del anuncio
  ad_creative_link_caption text,
  ad_creative_link_title text,
  ad_creative_link_description text,
  ad_snapshot_url text,              -- preview oficial de Meta
  imagen_url text,
  inicio date,
  fin date,
  paises text[],
  impresiones_min int,
  impresiones_max int,
  gasto_min numeric,
  gasto_max numeric,
  primera_vez_visto_at timestamptz default now(),
  ultima_vez_visto_at timestamptz default now(),
  activo boolean default true,
  detalles jsonb,                    -- raw payload por si necesitamos algo después
  unique (competidor_id, ad_id)
);

create index if not exists idx_ads_competidor on radar_ads_snapshots(competidor_id);
create index if not exists idx_ads_primera   on radar_ads_snapshots(primera_vez_visto_at desc);
create index if not exists idx_ads_activo    on radar_ads_snapshots(activo);

alter table radar_ads_snapshots enable row level security;
drop policy if exists "select_autenticado" on radar_ads_snapshots;
drop policy if exists "write_admin"        on radar_ads_snapshots;
create policy "select_autenticado" on radar_ads_snapshots for select using (usuario_activo());
create policy "write_admin"        on radar_ads_snapshots for all    using (usuario_activo()) with check (usuario_activo());

-- 5) Sugerencias de competidores descubiertos (antes de aceptar como activos)
create table if not exists radar_competidores_sugeridos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid references negocios(id),
  competidor_nombre text not null,
  pagina_fb text,
  pagina_ig text,
  url text,
  motivo text,                       -- por qué se sugiere
  ads_activos_count int default 0,
  keywords_match text,
  primera_vez_visto_at timestamptz default now(),
  estado text default 'pendiente' check (estado in ('pendiente', 'aceptado', 'rechazado')),
  unique (negocio_id, competidor_nombre)
);

create index if not exists idx_sug_negocio on radar_competidores_sugeridos(negocio_id);
create index if not exists idx_sug_estado  on radar_competidores_sugeridos(estado);

alter table radar_competidores_sugeridos enable row level security;
drop policy if exists "select_autenticado" on radar_competidores_sugeridos;
drop policy if exists "write_admin"        on radar_competidores_sugeridos;
create policy "select_autenticado" on radar_competidores_sugeridos for select using (usuario_activo());
create policy "write_admin"        on radar_competidores_sugeridos for all    using (usuario_activo()) with check (usuario_activo());
