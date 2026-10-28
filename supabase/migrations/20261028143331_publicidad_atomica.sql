begin;
create policy respaldo_servidor on cabo_private.reinicios_operacion for all to service_role using(true) with check(true);
create or replace function public.registrar_publicidad_atomica(p jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare actor uuid:=(p->>'usuario_id')::uuid; d jsonb:=p->'datos'; clave text:='ads:'||(p->>'clave'); huella text:=md5((p->'datos')::text); tx public.transacciones%rowtype; adid uuid:=gen_random_uuid();
begin
 if actor is distinct from (select propietario_id from public.configuracion_operacion where id=1) then raise exception 'No autorizado'; end if;
 if length(coalesce(p->>'clave',''))<8 or not exists(select 1 from public.negocios where id=(d->>'negocio_id')::uuid and activo) then raise exception 'Identificador o negocio inválidos'; end if;
 perform pg_advisory_xact_lock(hashtextextended(clave,0));
 select * into tx from public.transacciones where clave_idempotencia=clave;
 if found then
   if tx.raw_ai_response->>'solicitud_hash' is distinct from huella then raise exception 'Identificador reutilizado con datos distintos'; end if;
   return (tx.raw_ai_response->>'gasto_ads_id')::uuid;
 end if;
 if (d->>'monto')::numeric<=0 or (p->>'equivalente')::numeric<=0 then raise exception 'Monto inválido'; end if;
 insert into public.gastos_ads(id,negocio_id,fecha,monto,moneda,monto_mxn,tipo_cambio_usado,plataforma,metodo_captura,foto_url,capturado_por)
 values(adid,(d->>'negocio_id')::uuid,(d->>'fecha')::date,(d->>'monto')::numeric,d->>'moneda',(p->>'equivalente')::numeric,(p->>'tasa')::numeric,d->>'plataforma',coalesce(d->>'metodo_captura','manual'),d->>'foto_url',actor);
 insert into public.transacciones(tipo,fecha,monto,moneda,monto_mxn_equivalente,tipo_cambio_usado,negocio_id,categoria,concepto,metodo_pago,metodo_captura,capturado_por,notas,clave_idempotencia,raw_ai_response)
 values('gasto',(d->>'fecha')::date,(d->>'monto')::numeric,d->>'moneda',(p->>'equivalente')::numeric,(p->>'tasa')::numeric,(d->>'negocio_id')::uuid,'ads-'||(d->>'plataforma'),'Publicidad · '||(d->>'plataforma'),'otro','manual',actor,'Sincronizado desde gastos_ads (id: '||adid||')',clave,jsonb_build_object('solicitud_hash',huella,'gasto_ads_id',adid));
 return adid;
end $$;
revoke all on function public.registrar_publicidad_atomica(jsonb) from public,anon,authenticated;
grant execute on function public.registrar_publicidad_atomica(jsonb) to service_role;
commit;
