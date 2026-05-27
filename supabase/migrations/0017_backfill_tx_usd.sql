-- =============================================================
-- Migración 0017: Backfill robusto monto_mxn_equivalente en transacciones
-- =============================================================
-- Asegura que TODA transacción tenga monto_mxn_equivalente y
-- tipo_cambio_usado, incluso las viejas que se capturaron antes de
-- que existiera la conversión FX automática.
--
-- Estrategia:
--   1. MXN sin equivalente: equiv = monto, rate = 1
--   2. USD sin equivalente: busca rate para esa fecha
--   3. USD restantes: rate más reciente ANTES de la fecha
--   4. USD finales: rate más reciente global, o 17 fallback
-- =============================================================

update transacciones
   set monto_mxn_equivalente = monto,
       tipo_cambio_usado = 1
 where moneda = 'MXN'
   and monto_mxn_equivalente is null;

update transacciones t
   set tipo_cambio_usado = f.rate_compra,
       monto_mxn_equivalente = round((t.monto * f.rate_compra)::numeric, 2)
  from fx_rates f
 where t.moneda = 'USD'
   and t.monto_mxn_equivalente is null
   and f.fecha = t.fecha;

update transacciones t
   set tipo_cambio_usado = sub.rate_compra,
       monto_mxn_equivalente = round((t.monto * sub.rate_compra)::numeric, 2)
  from (
    select t2.id as tx_id,
           (select f.rate_compra
              from fx_rates f
             where f.fecha <= t2.fecha
             order by f.fecha desc
             limit 1) as rate_compra
      from transacciones t2
     where t2.moneda = 'USD'
       and t2.monto_mxn_equivalente is null
  ) sub
 where t.id = sub.tx_id
   and sub.rate_compra is not null;

update transacciones
   set tipo_cambio_usado = coalesce((select rate_compra from fx_rates order by fecha desc limit 1), 17),
       monto_mxn_equivalente = round((monto * coalesce((select rate_compra from fx_rates order by fecha desc limit 1), 17))::numeric, 2)
 where moneda = 'USD'
   and monto_mxn_equivalente is null;
