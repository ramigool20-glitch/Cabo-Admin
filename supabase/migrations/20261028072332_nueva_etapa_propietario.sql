begin;
set local lock_timeout = '5s';
create table if not exists cabo_private.reinicios_operacion (
  clave text primary key, realizado_at timestamptz not null default now(), respaldo jsonb not null
);
alter table cabo_private.reinicios_operacion enable row level security;
revoke all on cabo_private.reinicios_operacion from public, anon, authenticated;
grant all on cabo_private.reinicios_operacion to service_role;
alter table public.tareas add column if not exists archivada_at timestamptz;
create table if not exists public.configuracion_operacion (
  id integer primary key check(id=1), propietario_id uuid not null references auth.users(id),
  fecha_inicio date not null, reiniciado_at timestamptz not null default now()
);
alter table public.configuracion_operacion enable row level security;
revoke all on public.configuracion_operacion from public, anon, authenticated;
grant select on public.configuracion_operacion to authenticated;
grant all on public.configuracion_operacion to service_role;
drop policy if exists solo_propietario on public.configuracion_operacion;
create policy solo_propietario on public.configuracion_operacion for select to authenticated
using ((select cabo_private.es_propietario_activo()));
drop policy if exists tareas_vigentes on public.tareas;
create policy tareas_vigentes on public.tareas as restrictive for all to authenticated
using (archivada_at is null) with check (archivada_at is null);

do $$
declare owner_id uuid; n record; ads_id uuid; inicio date := (now() at time zone 'America/Mazatlan')::date;
begin
  perform pg_advisory_xact_lock(hashtextextended('cabo_reinicio_20261028',0));
  if exists(select 1 from cabo_private.reinicios_operacion where clave='nueva_etapa_2026_10_28') then return; end if;
  select u.id into strict owner_id from auth.users u join public.profiles p on p.id=u.id
    where lower(u.email)='ramigool20@gmail.com' and u.deleted_at is null and p.activo;
  insert into cabo_private.reinicios_operacion(clave,respaldo) select 'nueva_etapa_2026_10_28',jsonb_build_object(
    'negocios',(select jsonb_agg(to_jsonb(x)) from public.negocios x),
    'gastos_recurrentes',(select jsonb_agg(to_jsonb(x)) from public.gastos_recurrentes x),
    'tareas',(select jsonb_agg(to_jsonb(x)) from public.tareas x),
    'auditor_pendientes',(select jsonb_agg(to_jsonb(x)) from public.auditor_pendientes x),
    'auditor_observaciones',(select jsonb_agg(to_jsonb(x)) from public.auditor_observaciones x),
    'memoria_ia',(select jsonb_agg(to_jsonb(x)) from public.memoria_ia x),
    'notificaciones',(select jsonb_agg(to_jsonb(x)) from public.notificaciones_programadas x where not enviada)
  );
  insert into public.configuracion_operacion(id,propietario_id,fecha_inicio) values(1,owner_id,inicio)
  on conflict(id) do update set fecha_inicio=excluded.fecha_inicio,reiniciado_at=now();

  for n in select * from (values
    ('Cabo Walk-in Clinic','Cabo Bay Medical','https://cabobaymedical.com','#38bdf8','#0369a1'),
    ('CMC online','Clearwell Pharmacy','https://clearwellpharmacy.com','#34d399','#047857'),
    ('Pharmacy Doctors','Cabo Care Direct','https://cabocaredirect.com','#fbbf24','#b45309'),
    ('Cvu Pharmacy online','Cabo Wellcare','https://cabowellcare.com','#2dd4bf','#0f766e')
  ) as m(anterior,nombre,url,primario,secundario) loop
    if (select count(*) from public.negocios where nombre=n.anterior) <> 1 then raise exception 'Revisar negocio %',n.anterior; end if;
    update public.negocios set nombre=n.nombre,url=n.url,color_primario=n.primario,color_secundario=n.secundario,activo=true,
      notas=concat_ws(E'\n',notas,'Marca actualizada para operación individual; conserva historial del negocio anterior.') where nombre=n.anterior;
  end loop;
  update public.negocios set activo=false where nombre in ('Rancho McCoy','Cabo Pharmacy online');
  update public.negocios set url='https://ivtherapycabo.mx',color_primario='#818cf8',color_secundario='#4f46e5' where nombre='IV Therapy Cabo';
  update public.negocios set color_primario='#fb7185',color_secundario='#be123c' where nombre='Pharmacy in Cabo';
  insert into public.negocios(nombre,tipo,url,moneda_principal,color_primario,color_secundario)
  select nombre,tipo,url,'MXN',primario,secundario from (values
    ('Delivery Cabo','pagina_digital','https://deliverycabo.com','#fb923c','#c2410c'),
    ('Costa Serena Clinic','consultorio','https://costaserenaclinic.com','#22d3ee','#0e7490'),
    ('Wear Corve','pagina_digital','https://wearcorve.com','#e2e8f0','#475569')
  ) as m(nombre,tipo,url,primario,secundario)
  where not exists(select 1 from public.negocios existing where existing.url=m.url);

  update public.gastos_recurrentes set activo=false where activo;
  update public.tareas set archivada_at=now() where archivada_at is null;
  update public.auditor_pendientes set estado='descartada',contestada_at=now() where estado='abierta';
  update public.auditor_observaciones set estado='archivada',updated_at=now() where estado in ('nueva','vista');
  update public.memoria_ia set activa=false,updated_at=now() where activa;
  update public.notificaciones_programadas set destinatarios='{}' where not enviada;
  insert into public.memoria_ia(tipo,contenido,ambito,importancia,capturado_por) values
    ('contexto','La aplicación es de un solo propietario, Miguel. No hay socio ni reparto de utilidades. Rancho McCoy está retirado de la operación.','general',10,owner_id),
    ('contexto','Nueva etapa desde '||inicio||'. Analizar por defecto movimientos de esta etapa. Los registros anteriores son historia y no deben volver a generar tareas o alertas nuevas. Gastos fijos y tareas comienzan vacíos.','general',10,owner_id);

  -- Primer gasto solicitado. Se guarda una sola vez en publicidad y en contabilidad.
  insert into public.gastos_ads(negocio_id,fecha,monto,moneda,monto_mxn,tipo_cambio_usado,plataforma,metodo_captura,capturado_por)
    select id,inicio,1200,'MXN',1200,1,'google','manual',owner_id from public.negocios where nombre='IV Therapy Cabo' returning id into strict ads_id;
  insert into public.transacciones(tipo,fecha,monto,moneda,monto_mxn_equivalente,tipo_cambio_usado,negocio_id,categoria,concepto,metodo_captura,capturado_por,notas)
    select 'gasto',inicio,1200,'MXN',1200,1,id,'ads-google','Google Ads · IV Therapy Cabo','manual',owner_id,
      'Primer gasto de la nueva etapa. Cuenta de pago pendiente de indicar. Sincronizado desde gastos_ads (id: '||ads_id||')'
    from public.negocios where nombre='IV Therapy Cabo';
end;
$$;
commit;
