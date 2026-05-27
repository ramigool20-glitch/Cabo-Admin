-- =============================================================
-- Migración 0013: Historial de cambios de transacciones
-- =============================================================
-- Auditoría: cada vez que se crea, edita o borra una transacción,
-- se registra una fila con quién hizo el cambio y qué cambió.
-- =============================================================

create table if not exists transaccion_historial (
  id uuid primary key default gen_random_uuid(),
  transaccion_id uuid references transacciones(id) on delete set null,
  modificada_por uuid references profiles(id),
  accion text not null check (accion in ('creada', 'editada', 'eliminada')),
  cambios jsonb,           -- { campo: { antes: X, despues: Y } } solo para editada
  snapshot jsonb,          -- snapshot completo de la tx en ese momento
  created_at timestamptz default now()
);

create index if not exists idx_tx_hist_tx     on transaccion_historial(transaccion_id);
create index if not exists idx_tx_hist_user   on transaccion_historial(modificada_por);
create index if not exists idx_tx_hist_fecha  on transaccion_historial(created_at desc);

alter table transaccion_historial enable row level security;

drop policy if exists "select_autenticado" on transaccion_historial;
drop policy if exists "write_socio" on transaccion_historial;

create policy "select_autenticado" on transaccion_historial for select using (usuario_activo());
create policy "write_socio" on transaccion_historial for all using (usuario_activo()) with check (usuario_activo());
