-- =============================================================
-- Migración 0022: Memoria IA (aprendizaje continuo del auditor)
-- =============================================================
-- Tabla donde el auditor IA guarda aprendizajes, preferencias del usuario
-- y observaciones contextuales que debe recordar entre conversaciones.
--
-- Tipos:
--  preferencia: cómo le gusta que respondas o categorices
--  hecho:       dato confirmado (ej. "Sergio cubre la luz")
--  alerta:      patrón a vigilar (ej. "vigilar gastos de farmacia")
--  contexto:    info de negocio (ej. "el proveedor X cobra cada 15")
-- =============================================================

create table if not exists memoria_ia (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('preferencia', 'hecho', 'alerta', 'contexto', 'feedback')),
  contenido text not null,
  ambito text,                          -- ej: "casa", "pagina_1", "general", "rancho_mccoy"
  importancia int default 5 check (importancia between 1 and 10),
  capturado_por uuid references profiles(id),
  usado_count int default 0,            -- cuántas veces se ha usado en respuestas
  ultima_vez_usado_at timestamptz,
  activa boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_memoria_ia_tipo on memoria_ia(tipo);
create index if not exists idx_memoria_ia_ambito on memoria_ia(ambito);
create index if not exists idx_memoria_ia_activa on memoria_ia(activa, importancia desc);

alter table memoria_ia enable row level security;
drop policy if exists "select_autenticado" on memoria_ia;
drop policy if exists "write_admin"        on memoria_ia;
create policy "select_autenticado" on memoria_ia for select using (usuario_activo());
create policy "write_admin"        on memoria_ia for all    using (usuario_activo()) with check (usuario_activo());
