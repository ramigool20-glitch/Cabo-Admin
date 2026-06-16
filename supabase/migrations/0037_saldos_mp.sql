-- =============================================================
-- Migración 0037: Saldos en tiempo real de Mercado Pago
-- =============================================================
-- Agrega columnas a integraciones_mp para guardar el último saldo
-- reportado por la API de MP. Lo actualiza el cron mp-sync y el
-- endpoint manual /api/integraciones/mp/refresh-saldo.

alter table integraciones_mp
  add column if not exists saldo_disponible numeric(14,2),
  add column if not exists saldo_pendiente numeric(14,2),
  add column if not exists saldo_total numeric(14,2),
  add column if not exists saldo_moneda text default 'MXN',
  add column if not exists saldo_actualizado_at timestamptz,
  add column if not exists saldo_error text;       -- último error si MP falló

create index if not exists idx_int_mp_saldo_at on integraciones_mp(saldo_actualizado_at desc);
