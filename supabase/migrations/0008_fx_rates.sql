-- =============================================================
-- Migración 0008: Tipo de cambio diario USD/MXN
-- =============================================================
-- Una fila por día. El cron de la mañana hace UPSERT con el rate de
-- la fuente pública. El usuario puede sobrescribir manualmente desde /fx.

create table if not exists fx_rates (
  fecha date primary key,
  -- Rate "buy" — al que casa de cambio compra USD a clientes (lo más conservador para nuestros ingresos USD)
  rate_compra numeric(8,4) not null,
  -- Rate "sell" — al que casa de cambio vende USD a clientes (lo que pagamos si compramos USD)
  rate_venta numeric(8,4),
  -- Mid-market que devuelve Google / exchangerate.host
  mid_rate numeric(8,4),
  source text,                  -- 'exchangerate.host', 'open.er-api', 'manual', 'banxico'
  manual boolean default false, -- true si fue captura manual del usuario
  notas text,
  capturado_por uuid references profiles(id),
  fetched_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_fx_fecha on fx_rates(fecha desc);

alter table fx_rates enable row level security;

drop policy if exists "select_autenticado" on fx_rates;
drop policy if exists "write_socio"        on fx_rates;

create policy "select_autenticado" on fx_rates for select using (usuario_activo());
create policy "write_socio"        on fx_rates for all    using (usuario_activo()) with check (usuario_activo());

-- =============================================================
-- Columnas en transacciones para guardar el equivalente MXN
-- =============================================================
alter table transacciones
  add column if not exists monto_mxn_equivalente numeric(12,2),
  add column if not exists tipo_cambio_usado     numeric(8,4);

-- Para queries por equivalente MXN
create index if not exists idx_tx_mxn_equiv on transacciones(monto_mxn_equivalente);

-- =============================================================
-- Backfill: para transacciones MXN existentes, equivalente = monto
-- =============================================================
update transacciones
   set monto_mxn_equivalente = monto,
       tipo_cambio_usado = 1
 where moneda = 'MXN'
   and monto_mxn_equivalente is null;
