-- =============================================================
-- Migración 0012: Atribución de gastos personales en Casa
-- =============================================================
-- Cada gasto puede ser:
--   atribuido_a = NULL     → compartido entre socios (50/50)
--   atribuido_a = uuid     → personal de esa persona
--
-- Útil para gastos en Casa donde la cuenta del trabajo cubre tanto
-- gastos compartidos como gastos personales de cada socio.
-- =============================================================

alter table transacciones
  add column if not exists atribuido_a uuid references profiles(id);

create index if not exists idx_tx_atribuido on transacciones(atribuido_a);

comment on column transacciones.atribuido_a is
  'NULL = compartido (split entre socios). UUID = personal de esa persona. Relevante para gastos Casa.';
