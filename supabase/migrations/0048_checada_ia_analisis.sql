-- =============================================================
-- 0048: Análisis de estado con IA en checadas
-- =============================================================

alter table checadas
  add column if not exists analisis_estado text,   -- 'apto' | 'precaucion' | 'no_apto'
  add column if not exists analisis_score int,     -- 0-10 score de aptitud
  add column if not exists analisis_observaciones text,
  add column if not exists analisis_alerta boolean default false,
  add column if not exists analisis_at timestamptz;

create index if not exists idx_check_alerta on checadas(analisis_alerta) where analisis_alerta = true;
