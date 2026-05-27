-- =============================================================
-- Migración 0019: Backfill de ventas/gastos_ads → transacciones
-- =============================================================
-- Las ventas y gastos de ads existentes antes del cambio no tenían
-- transacción ligada. Esto los crea para que aparezcan en:
--   - Dashboard
--   - Totales del negocio
--   - Categorías de gasto
--   - /transacciones
--
-- Identificador del vínculo: en transacciones.notas escribimos
-- "Sincronizado desde ventas (id: <uuid>)" o
-- "Sincronizado desde gastos_ads (id: <uuid>)"
-- =============================================================

-- 1) Backfill VENTAS → ingreso (sin duplicar si ya existe)
insert into transacciones (
  tipo, monto, moneda, monto_mxn_equivalente, tipo_cambio_usado,
  fecha, concepto, negocio_id, categoria, metodo_pago, metodo_captura,
  capturado_por, notas, created_at
)
select
  'ingreso'::text,
  v.precio_venta,
  v.moneda,
  v.precio_venta_mxn,
  v.tipo_cambio_usado,
  v.fecha,
  coalesce(v.producto, 'Venta'),
  v.negocio_id,
  'ventas',
  'otro',
  'api',
  v.capturado_por,
  'Sincronizado desde ventas (id: ' || v.id::text || ')',
  v.created_at
from ventas v
where not exists (
  select 1 from transacciones t
   where t.negocio_id = v.negocio_id
     and t.notas like '%ventas (id: ' || v.id::text || ')%'
);

-- 2) Backfill costo_producto de VENTAS → gasto (solo si tienen costo > 0)
insert into transacciones (
  tipo, monto, moneda, monto_mxn_equivalente, tipo_cambio_usado,
  fecha, concepto, negocio_id, categoria, metodo_pago, metodo_captura,
  capturado_por, notas, created_at
)
select
  'gasto'::text,
  v.costo_producto,
  v.moneda,
  v.costo_producto_mxn,
  v.tipo_cambio_usado,
  v.fecha,
  'Costo: ' || coalesce(v.producto, 'producto'),
  v.negocio_id,
  'costo-producto',
  'otro',
  'api',
  v.capturado_por,
  'Sincronizado desde ventas (id: ' || v.id::text || ') costo',
  v.created_at
from ventas v
where v.costo_producto is not null
  and v.costo_producto > 0
  and not exists (
    select 1 from transacciones t
     where t.negocio_id = v.negocio_id
       and t.notas like '%ventas (id: ' || v.id::text || ') costo%'
  );

-- 3) Backfill GASTOS_ADS → gasto
insert into transacciones (
  tipo, monto, moneda, monto_mxn_equivalente, tipo_cambio_usado,
  fecha, concepto, negocio_id, categoria, metodo_pago, metodo_captura,
  capturado_por, notas, created_at
)
select
  'gasto'::text,
  g.monto,
  g.moneda,
  g.monto_mxn,
  g.tipo_cambio_usado,
  g.fecha,
  case g.plataforma
    when 'meta'   then 'Meta Ads (FB/IG)'
    when 'google' then 'Google Ads'
    when 'tiktok' then 'TikTok Ads'
    else 'Otros Ads'
  end,
  g.negocio_id,
  case g.plataforma
    when 'meta'   then 'ads-meta'
    when 'google' then 'ads-google'
    when 'tiktok' then 'ads-tiktok'
    else 'ads-otros'
  end,
  'otro',
  'api',
  g.capturado_por,
  'Sincronizado desde gastos_ads (id: ' || g.id::text || ')',
  g.created_at
from gastos_ads g
where not exists (
  select 1 from transacciones t
   where t.negocio_id = g.negocio_id
     and t.notas like '%gastos_ads (id: ' || g.id::text || ')%'
);
