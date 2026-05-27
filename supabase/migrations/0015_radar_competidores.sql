-- =============================================================
-- Migración 0015: Competidores en Radar
-- =============================================================
-- Registra competidores por dominio propio para que el Radar IA pueda
-- analizarlos. Cada socio puede agregar/editar competidores.
-- =============================================================

create table if not exists radar_competidores (
  id uuid primary key default gen_random_uuid(),
  dominio_propio text not null,                 -- ej: "pagina_1", "farmacia", "rancho_mccoy"
  competidor_nombre text not null,
  competidor_url text,
  descripcion text,
  tipo text default 'directo' check (tipo in ('directo', 'indirecto', 'referencia')),
  notas text,
  agregado_por uuid references profiles(id),
  activo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_radar_comp_dominio on radar_competidores(dominio_propio);
create index if not exists idx_radar_comp_activo on radar_competidores(activo);

alter table radar_competidores enable row level security;

drop policy if exists "select_autenticado" on radar_competidores;
drop policy if exists "write_socio"        on radar_competidores;

create policy "select_autenticado" on radar_competidores for select using (usuario_activo());
create policy "write_socio"        on radar_competidores for all    using (usuario_activo()) with check (usuario_activo());
