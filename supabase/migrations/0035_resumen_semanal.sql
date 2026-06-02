-- 0035 — Resumen ejecutivo semanal generado por IA
-- Cron lunes 8am crea una fila con métricas reales + narrativa IA.

create table if not exists public.resumen_semanal (
  id uuid primary key default gen_random_uuid(),
  semana_inicio date not null unique,
  semana_fin date not null,
  generado_at timestamptz not null default now(),
  resumen_md text not null,
  datos jsonb not null,
  enviado_push boolean not null default false
);

create index if not exists resumen_semanal_inicio_idx
  on public.resumen_semanal (semana_inicio desc);
