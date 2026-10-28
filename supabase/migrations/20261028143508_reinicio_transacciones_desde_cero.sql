begin;
set local lock_timeout='5s';
do $$
declare
  keep_tx uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('cabo_financial_reset_20261028',0));
  if exists(select 1 from cabo_private.reinicios_operacion where clave='movimientos_anteriores_2026_10_28') then return; end if;
  select id into strict keep_tx from public.transacciones
  where concepto='Google Ads · IV Therapy Cabo' and fecha=(now() at time zone 'America/Mazatlan')::date
    and monto=1200 and moneda='MXN'
    and negocio_id=(select id from public.negocios where nombre='IV Therapy Cabo' and activo)
  order by created_at desc limit 1;
  insert into cabo_private.reinicios_operacion(clave,respaldo)
  select 'movimientos_anteriores_2026_10_28', jsonb_build_object(
    'transacciones',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.transacciones x where x.id<>keep_tx),
    'ventas',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.ventas x),
    'gastos_ads',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.gastos_ads x where x.id <> (select nullif(regexp_replace(t.notas,'.*gastos_ads \(id: ([0-9a-f-]+)\).*','\1'),t.notas)::uuid from public.transacciones t where t.id=keep_tx)),
    'cortes_caja',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.cortes_caja x),
    'recurrentes_pagados',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.recurrentes_pagados x),
    'cobros_stripe',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.cobros_stripe x),
    'mp_pagos_procesados',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.mp_pagos_procesados x),
    'cuentas_por_cobrar_cobros',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.cuentas_por_cobrar_cobros x),
    'cuentas_por_pagar_pagos',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.cuentas_por_pagar_pagos x),
    'eventos_pagos',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.eventos_pagos x),
    'clinica_pagos',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.clinica_pagos x),
    'casa_shopping',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.casa_shopping x)
  );
  update public.recurrentes_pagados set transaccion_id=null where transaccion_id<>keep_tx;
  update public.multas set transaccion_id=null where transaccion_id<>keep_tx;
  update public.eventos_pagos set transaccion_id=null where transaccion_id<>keep_tx;
  update public.cobros_stripe set transaccion_id=null where transaccion_id<>keep_tx;
  update public.cuentas_por_pagar_pagos set transaccion_id=null where transaccion_id<>keep_tx;
  update public.cuentas_por_cobrar_cobros set transaccion_id=null where transaccion_id<>keep_tx;
  update public.casa_shopping set transaccion_id=null where transaccion_id<>keep_tx;
  update public.transaccion_historial set transaccion_id=null where transaccion_id<>keep_tx;
  update public.clinica_realizados set transaccion_id=null where transaccion_id<>keep_tx;
  update public.nomina_pagos set transaccion_id=null where transaccion_id<>keep_tx;
  update public.clinica_pagos set transaccion_id=null where transaccion_id<>keep_tx;
  update public.mp_pagos_procesados set transaccion_id=null where transaccion_id<>keep_tx;
  update public.whatsapp_mensajes set transaccion_id=null where transaccion_id<>keep_tx;
  update public.inventario_movimientos set transaccion_id=null where transaccion_id<>keep_tx;
  update public.cotizaciones set convertida_a_transaccion=null where convertida_a_transaccion<>keep_tx;
  update public.voice_events set transaccion_id=null where transaccion_id<>keep_tx;
  update public.voice_sesiones set transaccion_id=null where transaccion_id<>keep_tx;
  delete from public.transacciones where id<>keep_tx;
  delete from public.gastos_ads where id <> (select nullif(regexp_replace(t.notas,'.*gastos_ads \(id: ([0-9a-f-]+)\).*','\1'),t.notas)::uuid from public.transacciones t where t.id=keep_tx);
  delete from public.ventas;
  delete from public.cortes_caja;
  delete from public.recurrentes_pagados;
  delete from public.cobros_stripe;
  delete from public.cuentas_por_cobrar_cobros where transaccion_id is null;
  delete from public.cuentas_por_pagar_pagos where transaccion_id is null;
  delete from public.eventos_pagos where transaccion_id is null;
  delete from public.clinica_pagos where transaccion_id is null;
  update public.negocios set activo=false, notas=concat_ws(E'\n',notas,'Retirado de la operación por solicitud del propietario; datos conservados en respaldo privado.') where nombre='Cvu Pharmacy local' and activo;
  update public.configuracion_operacion set fecha_inicio=(now() at time zone 'America/Mazatlan')::date,reiniciado_at=now() where id=1;
end $$;
commit;
