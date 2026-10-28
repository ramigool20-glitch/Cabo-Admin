-- Ejecutar en transacción y terminar con ROLLBACK. No modifica datos de negocio.
-- La identidad se simula solo en esta conexión SQL administrativa, sin emitir JWT.
select set_config('cabo.owner_id', (select id::text from auth.users where lower(email)='ramigool20@gmail.com' and deleted_at is null), true);
select set_config('cabo.other_id', coalesce((select id::text from auth.users where deleted_at is not null limit 1),'00000000-0000-0000-0000-000000000001'), true);
select set_config('cabo.expected', jsonb_build_object(
  'negocios',(select count(*) from public.negocios),
  'transacciones',(select count(*) from public.transacciones),
  'profiles',(select count(*) from public.profiles),
  'inventario_productos',(select count(*) from public.inventario_productos),
  'venta_items',(select count(*) from public.venta_items),
  'cortes_caja',(select count(*) from public.cortes_caja),
  'storage.objects',current_setting('cabo.storage_expected')::bigint
)::text, true);
select set_config('request.jwt.claim.sub',current_setting('cabo.owner_id'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('cabo.owner_id'),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare t text; actual bigint; expected jsonb := current_setting('cabo.expected')::jsonb;
begin
  if not cabo_private.es_propietario_activo() then raise exception 'Propietario rechazado'; end if;
  foreach t in array array['negocios','transacciones','profiles','inventario_productos','venta_items','cortes_caja'] loop
    execute format('select count(*) from public.%I',t) into actual;
    if actual <> (expected->>t)::bigint then raise exception 'Conteo propietario incorrecto: %',t; end if;
  end loop;
  select count(*) into actual from storage.objects;
  if actual <> (expected->>'storage.objects')::bigint then raise exception 'Archivos del propietario inaccesibles'; end if;
  if has_table_privilege(current_user,'public.profiles','UPDATE')
    or has_any_column_privilege(current_user,'public.profiles','UPDATE')
    or has_table_privilege(current_user,'public.integraciones_mp','SELECT')
    or has_table_privilege(current_user,'public.transacciones','TRUNCATE') then
    raise exception 'Permiso excesivo conservado';
  end if;
end;
$$;
select set_config('request.jwt.claim.sub',current_setting('cabo.other_id'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('cabo.other_id'),'role','authenticated')::text,true);
do $$
declare t record; actual bigint;
begin
  if cabo_private.es_propietario_activo() then raise exception 'Identidad ajena aceptada'; end if;
  for t in select tablename from pg_tables where schemaname='public' loop
    begin
      execute format('select count(*) from public.%I',t.tablename) into actual;
      if actual <> 0 then raise exception 'Datos visibles para tercero en %',t.tablename; end if;
    exception when insufficient_privilege then null;
    end;
  end loop;
  select count(*) into actual from storage.objects;
  if actual <> 0 then raise exception 'Archivos visibles para tercero'; end if;
  select count(*) into actual from public.error_log_resumen;
  if actual <> 0 then raise exception 'Vista errores expuesta'; end if;
  select count(*) into actual from public.voice_auditoria_diaria;
  if actual <> 0 then raise exception 'Vista voz expuesta'; end if;
end;
$$;
reset role;
set local role anon;
do $$
declare t record;
begin
  for t in select c.oid,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v') loop
    if has_table_privilege(current_user,t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') then
      raise exception 'Permiso anonimo conservado en %',t.relname;
    end if;
  end loop;
end;
$$;
reset role;
select jsonb_build_object('owner_access',true,'other_identity_denied',true,'anonymous_privileges_removed',true,'private_views',true,'profile_update_denied',true,'mp_tokens_server_only',true,'business_data_writes',0) as tests;
