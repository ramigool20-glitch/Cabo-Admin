-- =============================================================
-- Migración 0016: Conversión MXN en ventas y gastos_ads
-- =============================================================
-- Para cada venta y gasto_ad guardamos su equivalente en MXN y el
-- tipo de cambio usado. Esto permite reportes en MXN sin recalcular.
-- =============================================================

alter table ventas
  add column if not exists precio_venta_mxn numeric(12,2),
  add column if not exists costo_producto_mxn numeric(12,2),
  add column if not exists tipo_cambio_usado numeric(8,4);

alter table gastos_ads
  add column if not exists monto_mxn numeric(12,2),
  add column if not exists tipo_cambio_usado numeric(8,4);

-- Backfill MXN: equivalente = monto original, rate = 1
update ventas
   set precio_venta_mxn = precio_venta,
       costo_producto_mxn = costo_producto,
       tipo_cambio_usado = 1
 where moneda = 'MXN' and precio_venta_mxn is null;

update gastos_ads
   set monto_mxn = monto,
       tipo_cambio_usado = 1
 where moneda = 'MXN' and monto_mxn is null;

-- Backfill USD: usa el rate más reciente conocido (o 17 fallback)
-- Sin bloques DO; usamos subqueries inline
update ventas
   set precio_venta_mxn = precio_venta * coalesce((select rate_compra from fx_rates order by fecha desc limit 1), 17),
       costo_producto_mxn = coalesce(costo_producto, 0) * coalesce((select rate_compra from fx_rates order by fecha desc limit 1), 17),
       tipo_cambio_usado = coalesce((select rate_compra from fx_rates order by fecha desc limit 1), 17)
 where moneda = 'USD' and precio_venta_mxn is null;

update gastos_ads
   set monto_mxn = monto * coalesce((select rate_compra from fx_rates order by fecha desc limit 1), 17),
       tipo_cambio_usado = coalesce((select rate_compra from fx_rates order by fecha desc limit 1), 17)
 where moneda = 'USD' and monto_mxn is null;

create index if not exists idx_ventas_mxn on ventas(precio_venta_mxn);
create index if not exists idx_gastos_ads_mxn on gastos_ads(monto_mxn);
