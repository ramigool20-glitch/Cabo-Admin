-- =============================================================
-- Migración 0020: Backfill transacciones (ads/ventas) → gastos_ads / ventas
-- =============================================================
-- Detecta transacciones con categoría/concepto que indican gasto de ads
-- o venta, y crea su contrapartida en gastos_ads / ventas si no existe.
--
-- Detección:
--   Ads: categoria empieza por 'ads' O concepto contiene palabra clave
--   Plataforma: meta/facebook/instagram → 'meta'
--               google/adwords/youtube → 'google'
--               tiktok → 'tiktok'
--               otro caso → 'otro'
--   Ventas: categoria es 'ventas'/'venta' O concepto empieza con 'venta:'
-- =============================================================

-- 1) Backfill ADS: transacciones tipo=gasto con categoría/concepto de ads
--    en negocios página digital, que no tengan ya un gastos_ads similar.
insert into gastos_ads (
  negocio_id, fecha, monto, moneda, monto_mxn, tipo_cambio_usado,
  plataforma, metodo_captura, capturado_por, created_at
)
select
  t.negocio_id,
  t.fecha,
  t.monto,
  t.moneda,
  t.monto_mxn_equivalente,
  t.tipo_cambio_usado,
  case
    when lower(coalesce(t.categoria, '') || ' ' || coalesce(t.concepto, '')) ~ '(meta|facebook|fb|instagram|ig)' then 'meta'
    when lower(coalesce(t.categoria, '') || ' ' || coalesce(t.concepto, '')) ~ '(google|adwords|youtube)' then 'google'
    when lower(coalesce(t.categoria, '') || ' ' || coalesce(t.concepto, '')) ~ 'tiktok' then 'tiktok'
    else 'otro'
  end as plataforma,
  coalesce(t.metodo_captura, 'manual'),
  t.capturado_por,
  t.created_at
from transacciones t
join negocios n on n.id = t.negocio_id
where t.tipo = 'gasto'
  and n.tipo = 'pagina_digital'
  and (
    lower(coalesce(t.categoria, '')) ~ '^ads(-|$| )'
    or (
      lower(coalesce(t.concepto, '')) ~ '\m(ads?|anuncio|publicidad|campa[ñn]a)\M'
      and lower(coalesce(t.concepto, '')) ~ '(meta|facebook|fb|instagram|ig|google|adwords|youtube|tiktok)'
    )
  )
  -- No duplicar si ya hay un gastos_ads con mismo negocio, fecha y monto
  and not exists (
    select 1 from gastos_ads g
    where g.negocio_id = t.negocio_id
      and g.fecha = t.fecha
      and g.monto = t.monto
  )
  -- No duplicar si la tx ya está marcada como sincronizada
  and (t.notas is null or t.notas !~ 'Sincronizado desde gastos_ads');

-- 2) Backfill VENTAS: transacciones tipo=ingreso con categoría 'ventas' o 'venta'
insert into ventas (
  negocio_id, fecha, producto, precio_venta, moneda,
  precio_venta_mxn, tipo_cambio_usado,
  capturado_por, created_at
)
select
  t.negocio_id,
  t.fecha,
  coalesce(t.concepto, 'Venta'),
  t.monto,
  t.moneda,
  t.monto_mxn_equivalente,
  t.tipo_cambio_usado,
  t.capturado_por,
  t.created_at
from transacciones t
join negocios n on n.id = t.negocio_id
where t.tipo = 'ingreso'
  and n.tipo = 'pagina_digital'
  and (
    lower(coalesce(t.categoria, '')) in ('ventas', 'venta')
    or lower(coalesce(t.concepto, '')) ~ '^(venta:|vendido:)'
  )
  and not exists (
    select 1 from ventas v
    where v.negocio_id = t.negocio_id
      and v.fecha = t.fecha
      and v.precio_venta = t.monto
  )
  and (t.notas is null or t.notas !~ 'Sincronizado desde ventas');
