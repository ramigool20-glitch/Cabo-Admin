begin;
set local lock_timeout='5s';
alter table public.transacciones add column if not exists clave_idempotencia text;
alter table public.transacciones add column if not exists anulada_at timestamptz;
alter table public.transacciones add column if not exists anulada_por uuid references public.profiles(id);
alter table public.transacciones add column if not exists stock_aplicado boolean not null default false;
create unique index if not exists transacciones_idempotencia_uidx on public.transacciones(clave_idempotencia) where clave_idempotencia is not null;
alter table public.cortes_caja add column if not exists esperado_efectivo_usd numeric not null default 0;
alter table public.cortes_caja add column if not exists contado_efectivo_usd numeric;
alter table public.cortes_caja add column if not exists contado_transfer_mxn numeric;
alter table public.cortes_caja add column if not exists tipo_cambio_usado numeric;
alter table public.cortes_caja add column if not exists clave_idempotencia text;
create unique index if not exists cortes_idempotencia_uidx on public.cortes_caja(clave_idempotencia) where clave_idempotencia is not null;

create or replace function public.registrar_venta_atomica(p jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare actor uuid:=(p->>'usuario_id')::uuid; negocio uuid:=(p->>'negocio_id')::uuid;
 cuenta uuid:=(p->>'cuenta_id')::uuid; fecha_venta date:=(p->>'fecha')::date;
 clave text:=p->>'clave_idempotencia'; huella text:=md5((p->'solicitud')::text);
 tx public.transacciones%rowtype; prod public.inventario_productos%rowtype; i jsonb;
 txid uuid:=gen_random_uuid(); total numeric:=0; cant numeric; precio numeric; descuento numeric; sub numeric; costo numeric; nombre text;
 moneda text:=coalesce(p->>'moneda','MXN'); tasa numeric:=coalesce((p->>'tasa')::numeric,1); aplicar boolean:=coalesce((p->>'descontar_stock')::boolean,true);
begin
 if actor is distinct from (select propietario_id from public.configuracion_operacion where id=1)
   or not exists(select 1 from public.profiles where id=actor and activo) then raise exception 'Propietario no autorizado'; end if;
 if clave is null or length(clave)<8 or length(clave)>150 then raise exception 'Falta identificador de venta'; end if;
 perform pg_advisory_xact_lock(hashtextextended('venta:'||clave,0));
 select * into tx from public.transacciones where clave_idempotencia=clave;
 if found then
   if tx.raw_ai_response->>'solicitud_hash' is distinct from huella then raise exception 'Identificador reutilizado con datos diferentes'; end if;
   return jsonb_build_object('id',tx.id,'repetida',true,'anulada',tx.anulada_at is not null);
 end if;
 if not exists(select 1 from public.negocios where id=negocio and activo) or not exists(select 1 from public.cuentas where id=cuenta and activo) then raise exception 'Negocio o cuenta inactivos'; end if;
 if moneda not in ('MXN','USD') or tasa<=0 then raise exception 'Moneda o tipo de cambio inválidos'; end if;
 if jsonb_typeof(p->'items')<>'array' or jsonb_array_length(p->'items') not between 1 and 100 then raise exception 'Items inválidos'; end if;
 perform pg_advisory_xact_lock(hashtextextended('caja:'||negocio||':'||fecha_venta,0));
 -- Orden estable de bloqueos: las ventas concurrentes no pisan el stock.
 perform 1 from public.inventario_productos where id in (select (x->>'producto_id')::uuid from jsonb_array_elements(p->'items') x where x->>'producto_id' is not null) order by id for update;
 for i in select * from jsonb_array_elements(p->'items') loop
   cant:=(i->>'cantidad')::numeric;precio:=(i->>'precio_unitario_mxn')::numeric;descuento:=coalesce((i->>'descuento_pct')::numeric,0);
   if cant is null or cant<=0 or precio is null or precio<0 or descuento not between 0 and 100 then raise exception 'Cantidad, precio o descuento inválidos'; end if;
   total:=total+round(cant*precio*(1-descuento/100),2);
 end loop;
 if total<=0 then raise exception 'El total debe ser positivo'; end if;
 insert into public.transacciones(id,tipo,fecha,monto,moneda,monto_mxn_equivalente,tipo_cambio_usado,negocio_id,cuenta_id,metodo_pago,categoria,concepto,notas,metodo_captura,capturado_por,clave_idempotencia,stock_aplicado,raw_ai_response)
 values(txid,'ingreso',fecha_venta,case when moneda='USD' then round(total/tasa,2) else total end,moneda,total,tasa,negocio,cuenta,p->>'metodo_pago','Venta de productos',p->>'concepto',p->>'notas','manual',actor,clave,aplicar,jsonb_build_object('solicitud_hash',huella));
 for i in select * from jsonb_array_elements(p->'items') loop
   cant:=(i->>'cantidad')::numeric;precio:=(i->>'precio_unitario_mxn')::numeric;descuento:=coalesce((i->>'descuento_pct')::numeric,0);
   sub:=round(cant*precio*(1-descuento/100),2);costo:=(i->>'costo_unitario_snapshot_mxn')::numeric;nombre:=i->>'nombre_snapshot';
   if i->>'producto_id' is not null then
     select * into strict prod from public.inventario_productos where id=(i->>'producto_id')::uuid;
     if not prod.activo or (prod.negocio_id is not null and prod.negocio_id<>negocio) then raise exception 'Producto ajeno al negocio o inactivo'; end if;
     nombre:=prod.nombre;costo:=prod.costo_mxn;
     if aplicar then
       if cant<>trunc(cant) then raise exception 'El inventario requiere cantidades enteras'; end if;
       if prod.stock<cant then raise exception 'Stock insuficiente: %',prod.nombre; end if;
       update public.inventario_productos set stock=stock-cant::integer where id=prod.id;
       insert into public.inventario_movimientos(producto_id,tipo,cantidad,precio_unitario,motivo,transaccion_id,creado_por)
       values(prod.id,'venta',-cant::integer,precio,'Venta '||txid,txid,actor);
     end if;
   end if;
   insert into public.venta_items(transaccion_id,producto_id,nombre_snapshot,codigo_barras_snapshot,categoria_snapshot,costo_unitario_snapshot_mxn,cantidad,precio_unitario_mxn,descuento_pct,descuento_mxn,subtotal_mxn,ganancia_mxn)
   values(txid,(i->>'producto_id')::uuid,nombre,i->>'codigo_barras_snapshot',i->>'categoria_snapshot',costo,cant,precio,descuento,round(cant*precio,2)-sub,sub,case when costo is null then null else sub-costo*cant end);
 end loop;
 return jsonb_build_object('id',txid,'repetida',false,'anulada',false);
end; $$;

create or replace function public.anular_venta_atomica(p jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare tx public.transacciones%rowtype; m record; actor uuid:=(p->>'usuario_id')::uuid;
begin
 if actor is distinct from (select propietario_id from public.configuracion_operacion where id=1) then raise exception 'No autorizado'; end if;
 select * into strict tx from public.transacciones where id=(p->>'id')::uuid for update;
 if tx.anulada_at is not null then return jsonb_build_object('id',tx.id,'repetida',true); end if;
 if tx.tipo<>'ingreso' or not tx.tiene_items or length(trim(coalesce(p->>'motivo','')))<5 then raise exception 'Venta o motivo inválidos'; end if;
 if tx.clave_idempotencia is null then raise exception 'Venta histórica: revisar stock manualmente antes de anular'; end if;
 perform pg_advisory_xact_lock(hashtextextended('caja:'||tx.negocio_id||':'||tx.fecha,0));
 for m in select producto_id,-sum(cantidad)::integer as devolver from public.inventario_movimientos where transaccion_id=tx.id and tipo='venta' group by producto_id order by producto_id loop
   update public.inventario_productos set stock=stock+m.devolver where id=m.producto_id;
   insert into public.inventario_movimientos(producto_id,tipo,cantidad,motivo,transaccion_id,creado_por) values(m.producto_id,'entrada',m.devolver,'Anulación: '||(p->>'motivo'),tx.id,actor);
 end loop;
 update public.transacciones set monto=0,monto_mxn_equivalente=0,ganancia_estimada_mxn=0,costo_total_mxn=0,categoria='venta_anulada',anulada_at=now(),anulada_por=actor,
   raw_ai_response=coalesce(raw_ai_response,'{}')||jsonb_build_object('anulacion',jsonb_build_object('monto_original',tx.monto,'moneda',tx.moneda,'total_mxn_original',tx.monto_mxn_equivalente,'motivo',p->>'motivo')) where id=tx.id;
 return jsonb_build_object('id',tx.id,'repetida',false);
end; $$;

create or replace function public.contabilizar_stripe_atomico(p jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.cobros_stripe%rowtype; txid uuid;
begin
 select * into strict c from public.cobros_stripe where id=(p->>'id')::uuid for update;
 if c.transaccion_id is not null then return jsonb_build_object('creada',false,'id',c.transaccion_id); end if;
 insert into public.transacciones(tipo,monto,moneda,monto_mxn_equivalente,tipo_cambio_usado,fecha,concepto,negocio_id,categoria,metodo_captura,metodo_pago,capturado_por,raw_ai_response,clave_idempotencia)
 values('ingreso',c.monto,c.moneda,(p->>'equivalente')::numeric,(p->>'tasa')::numeric,(p->>'fecha')::date,c.descripcion||coalesce(' - '||c.cliente_nombre,''),c.negocio_id,'stripe','api','stripe',c.creado_por,jsonb_build_object('stripe_payment_intent_id',p->>'payment_intent'),'stripe:'||c.id) returning id into txid;
 update public.cobros_stripe set estado='cobrado',cobrado_at=now(),stripe_payment_intent_id=p->>'payment_intent',transaccion_id=txid where id=c.id;
 return jsonb_build_object('creada',true,'id',txid);
end; $$;

create or replace function public.contabilizar_mp_atomico(p jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare previo public.mp_pagos_procesados%rowtype; integ public.integraciones_mp%rowtype; txid uuid; feeid uuid; t jsonb:=p->'tx'; fee numeric:=coalesce((p->>'comision')::numeric,0);
begin
 perform pg_advisory_xact_lock(hashtextextended('mp:'||(p->>'payment_id'),0));
 select * into previo from public.mp_pagos_procesados where mp_payment_id=p->>'payment_id' for update;
 if previo.transaccion_id is not null then return jsonb_build_object('creada',false,'id',previo.transaccion_id); end if;
 select * into strict integ from public.integraciones_mp where id=(p->>'integracion_id')::uuid for update;
 if not integ.activa then raise exception 'Integración inactiva'; end if;
 if p->>'estado'<>'approved' then return jsonb_build_object('creada',false); end if;
 insert into public.transacciones(tipo,monto,moneda,monto_mxn_equivalente,tipo_cambio_usado,fecha,negocio_id,cuenta_id,categoria,concepto,metodo_pago,metodo_captura,notas,clave_idempotencia)
 values(t->>'tipo',(t->>'monto')::numeric,t->>'moneda',(t->>'monto_mxn_equivalente')::numeric,(t->>'tipo_cambio_usado')::numeric,(t->>'fecha')::date,(t->>'negocio_id')::uuid,integ.cuenta_id,t->>'categoria',t->>'concepto','mp_terminal','api','Mercado Pago payment '||(p->>'payment_id'),'mp:'||(p->>'payment_id')) returning id into txid;
 if fee>0 and t->>'tipo'='ingreso' then
   insert into public.transacciones(tipo,monto,moneda,monto_mxn_equivalente,tipo_cambio_usado,fecha,negocio_id,cuenta_id,categoria,concepto,metodo_pago,metodo_captura,notas,clave_idempotencia)
   values('gasto',fee,t->>'moneda',(p->>'comision_mxn')::numeric,(t->>'tipo_cambio_usado')::numeric,(t->>'fecha')::date,(t->>'negocio_id')::uuid,integ.cuenta_id,'comisiones','Comisión MP','mp_terminal','api','Comisión del movimiento '||txid,'mp-fee:'||(p->>'payment_id')) returning id into feeid;
 end if;
 insert into public.mp_pagos_procesados(mp_payment_id,integracion_id,transaccion_id,monto,moneda,estado)
 values(p->>'payment_id',integ.id,txid,(t->>'monto')::numeric,t->>'moneda','approved')
 on conflict(mp_payment_id) do update set transaccion_id=excluded.transaccion_id,estado='approved',procesado_at=now();
 update public.integraciones_mp set ultimo_sync=now(),cobros_count=coalesce(cobros_count,0)+1 where id=integ.id;
 return jsonb_build_object('creada',true,'id',txid,'fee_id',feeid);
end; $$;

create or replace function public.cerrar_caja_atomica(p jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare actor uuid:=(p->>'usuario_id')::uuid; negocio uuid:=(p->>'negocio_id')::uuid; dia date:=(p->>'fecha')::date; clave text:=p->>'clave_idempotencia';
 result uuid; tasa numeric:=(p->>'tasa')::numeric; ef numeric:=0; usd numeric:=0; mp numeric:=0; tarjeta numeric:=0; transfer numeric:=0; total numeric; ganancia numeric:=0; n bigint:=0; unidades numeric:=0;
 contado_ef numeric:=(p->>'contado_efectivo_mxn')::numeric; contado_usd numeric:=coalesce((p->>'contado_efectivo_usd')::numeric,0); c_mp numeric; c_tarjeta numeric; c_transfer numeric;
begin
 if actor is distinct from (select propietario_id from public.configuracion_operacion where id=1) then raise exception 'No autorizado'; end if;
 if clave is null or length(clave)<8 or tasa<=0 or contado_ef<0 or contado_usd<0 then raise exception 'Datos de corte inválidos'; end if;
 perform pg_advisory_xact_lock(hashtextextended('caja:'||negocio||':'||dia,0));
 select id into result from public.cortes_caja where clave_idempotencia=clave;
 if found then return result; end if;
 if not exists(select 1 from public.negocios where id=negocio and activo) then raise exception 'Negocio inactivo'; end if;
 select
 coalesce(sum(case when metodo_pago='efectivo_mxn' and moneda='MXN' then monto else 0 end),0),
 coalesce(sum(case when metodo_pago='efectivo_usd' and moneda='USD' then monto else 0 end),0),
 coalesce(sum(case when metodo_pago like 'mp_%' then coalesce(monto_mxn_equivalente,case when moneda='MXN' then monto else monto*tasa end) else 0 end),0),
 coalesce(sum(case when metodo_pago in ('tarjeta','stripe') then coalesce(monto_mxn_equivalente,case when moneda='MXN' then monto else monto*tasa end) else 0 end),0),
 coalesce(sum(case when metodo_pago='transferencia_bancaria' then coalesce(monto_mxn_equivalente,case when moneda='MXN' then monto else monto*tasa end) else 0 end),0),
 coalesce(sum(ganancia_estimada_mxn),0),count(*) into ef,usd,mp,tarjeta,transfer,ganancia,n
 from public.transacciones where negocio_id=negocio and fecha=dia and tipo='ingreso' and tiene_items and anulada_at is null;
 if exists(select 1 from public.transacciones where negocio_id=negocio and fecha=dia and tipo='ingreso' and tiene_items and anulada_at is null and (metodo_pago is null or metodo_pago not in ('efectivo_mxn','efectivo_usd','mp_terminal','mp_transferencia','mp_link','tarjeta','stripe','transferencia_bancaria'))) then raise exception 'Hay ventas sin método de pago conciliable. Corrígelas antes del corte.'; end if;
 select coalesce(sum(i.cantidad),0) into unidades from public.venta_items i join public.transacciones t on t.id=i.transaccion_id where t.negocio_id=negocio and t.fecha=dia and t.tipo='ingreso' and t.anulada_at is null;
 c_mp:=coalesce((p->>'contado_mp_mxn')::numeric,mp);c_tarjeta:=coalesce((p->>'contado_tarjeta_mxn')::numeric,tarjeta);c_transfer:=coalesce((p->>'contado_transfer_mxn')::numeric,transfer);
 if c_mp<0 or c_tarjeta<0 or c_transfer<0 then raise exception 'Conteo negativo'; end if;
 total:=ef+usd*tasa+mp+tarjeta+transfer;
 insert into public.cortes_caja(negocio_id,cajera_id,cajera_nombre,fecha,esperado_efectivo_mxn,esperado_efectivo_usd,esperado_mp_mxn,esperado_tarjeta_mxn,esperado_transfer_mxn,esperado_total_mxn,contado_efectivo_mxn,contado_efectivo_usd,contado_mp_mxn,contado_tarjeta_mxn,contado_transfer_mxn,diferencia_efectivo_mxn,diferencia_total_mxn,ventas_count,unidades_vendidas,ganancia_estimada_mxn,notas,estado,tipo_cambio_usado,clave_idempotencia)
 values(negocio,actor,(select nombre from public.profiles where id=actor),dia,ef,usd,mp,tarjeta,transfer,total,contado_ef,contado_usd,c_mp,c_tarjeta,c_transfer,(ef-contado_ef)+(usd-contado_usd)*tasa,total-contado_ef-contado_usd*tasa-c_mp-c_tarjeta-c_transfer,n,unidades,ganancia,p->>'notas','cerrado',tasa,clave) returning id into result;
 return result;
end; $$;

revoke all on function public.registrar_venta_atomica(jsonb),public.anular_venta_atomica(jsonb),public.contabilizar_stripe_atomico(jsonb),public.contabilizar_mp_atomico(jsonb),public.cerrar_caja_atomica(jsonb) from public,anon,authenticated;
grant execute on function public.registrar_venta_atomica(jsonb),public.anular_venta_atomica(jsonb),public.contabilizar_stripe_atomico(jsonb),public.contabilizar_mp_atomico(jsonb),public.cerrar_caja_atomica(jsonb) to service_role;
commit;
