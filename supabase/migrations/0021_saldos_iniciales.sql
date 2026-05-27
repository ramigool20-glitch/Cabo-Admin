-- =============================================================
-- Migración 0021: Saldos iniciales y ajustes con motivo
-- =============================================================
-- Permite capturar el saldo inicial de cada cuenta una sola vez.
-- Después, los saldos se calculan como:
--   saldo_inicial + Σ(ingresos cuenta) - Σ(gastos cuenta)
--
-- Para corregir discrepancias con el banco se usa una transacción
-- con categoría 'ajuste-saldo' y motivo obligatorio en concepto/notas.
-- =============================================================

alter table cuentas
  add column if not exists saldo_inicial_mxn numeric(14,2) default 0,
  add column if not exists saldo_inicial_usd numeric(14,2) default 0,
  add column if not exists saldo_inicial_fecha date,
  add column if not exists saldo_inicial_locked boolean default false,
  add column if not exists saldo_inicial_notas text,
  add column if not exists saldo_inicial_capturado_por uuid references profiles(id);

create index if not exists idx_cuentas_locked on cuentas(saldo_inicial_locked);
