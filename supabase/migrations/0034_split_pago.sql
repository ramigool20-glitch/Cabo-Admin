-- 0034 — Pago dividido entre 2 cuentas (split)
-- Cada split crea 2 filas en transacciones con un split_grupo_id común.

alter table public.transacciones
  add column if not exists split_grupo_id uuid null;

create index if not exists transacciones_split_grupo_id_idx
  on public.transacciones (split_grupo_id)
  where split_grupo_id is not null;
