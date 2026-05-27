-- =============================================================
-- Migración 0016: Conversión MXN en ventas y gastos_ads
-- =============================================================
-- Igual que en transacciones, guardamos monto_mxn_equivalente y
-- tipo_cambio_usado para cada venta y gasto_ad. Esto permite reportes
-- en MXN sin recalcular cada vez.
-- =============================================================

alter table ventas
  add column if not exists precio_venta_mxn numeric(12,2),
  add column if not exists costo_producto_mxn numeric(12,2),
  add column if not exists tipo_cambio_usado numeric(8,4);

alter table gastos_ads
  add column if not exists monto_mxn numeric(12,2),
  add column if not exists tipo_cambio_usado numeric(8,4);

-- Backfill: para MXN, el equivalente = el monto original
update ventas
   set precio_venta_mxn = precio_venta,
       costo_producto_mxn = costo_producto,
       tipo_cambio_usado = 1
 where moneda = 'MXN' and precio_venta_mxn is null;

update gastos_ads
   set monto_mxn = monto,
       tipo_cambio_usado = 1
 where moneda = 'MXN' and monto_mxn is null;

-- Para USD existentes: backfill al rate más reciente conocido (o 17 como fallback)
do $$
declare
  rate numeric;
begin
  select coalesce(rate_compra, 17) into rate
  from fx_rates order by fecha desc limit 1;
  if rate is null then rate := 17; end if;

  update ventas
     set precio_venta_mxn = precio_venta * rate,
         costo_producto_mxn = costo_producto * rate,
         tipo_cambio_usado = rate
   where moneda = 'USD' and precio_venta_mxn is null;

  update gastos_ads
     set monto_mxn = monto * rate,
         tipo_cambio_usado = rate
   where moneda = 'USD' and monto_mxn is null;
end $$;

create index if not exists idx_ventas_mxn on ventas(precio_venta_mxn);
create index if not exists idx_gastos_ads_mxn on gastos_ads(monto_mxn);
