-- Cabo Admin: acceso exclusivo del propietario. Conserva datos e historial.
-- Revisar proyecto, respaldo de permisos y pruebas antes de aplicar.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if not exists (
    select 1 from auth.users u
    join public.profiles p on p.id = u.id
    join public.roles r on r.id = p.role_id
    where lower(u.email) = 'ramigool20@gmail.com'
      and u.deleted_at is null and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until <= now())
      and p.activo = true and r.nombre = 'admin'
  ) or (select count(*) from auth.users where lower(email) = 'ramigool20@gmail.com' and deleted_at is null) <> 1 then
    raise exception 'Recuperar primero al propietario confirmado, activo y admin';
  end if;
  if exists (select 1 from public.profiles p join auth.users u on u.id=p.id where p.activo and lower(u.email) <> 'ramigool20@gmail.com') then
    raise exception 'Revisar perfiles activos ajenos antes de limitar acceso';
  end if;
end;
$$;

-- La consulta privilegiada de identidad queda fuera del esquema de la API.
create schema if not exists cabo_private;
revoke all on schema cabo_private from public, anon, authenticated;
grant usage on schema cabo_private to authenticated, service_role;
create or replace function cabo_private.es_propietario_activo()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u join public.profiles p on p.id = u.id
    where u.id = (select auth.uid())
      and lower(u.email) = 'ramigool20@gmail.com'
      and u.deleted_at is null and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until <= now())
      and p.activo = true
  );
$$;
revoke all on function cabo_private.es_propietario_activo() from public, anon, authenticated;
grant execute on function cabo_private.es_propietario_activo() to authenticated, service_role;

-- Compatibilidad con las políticas actuales, sin funciones privilegiadas públicas.
create or replace function public.usuario_activo()
returns boolean language sql stable security invoker set search_path = '' as $$
  select cabo_private.es_propietario_activo();
$$;
create or replace function public.es_socio_o_admin()
returns boolean language sql stable security invoker set search_path = '' as $$
  select cabo_private.es_propietario_activo();
$$;
revoke all on function public.usuario_activo(), public.es_socio_o_admin() from public, anon;
grant execute on function public.usuario_activo(), public.es_socio_o_admin() to authenticated, service_role;

-- AND con las políticas existentes. No amplía permisos de módulos internos.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('drop policy if exists solo_propietario on public.%I', t.tablename);
    execute format(
      'create policy solo_propietario on public.%I as restrictive for all to authenticated using ((select cabo_private.es_propietario_activo())) with check ((select cabo_private.es_propietario_activo()))', t.tablename
    );
    -- TRUNCATE no pasa por RLS. Los clientes solo necesitan CRUD.
    execute format('revoke truncate, references, trigger on public.%I from authenticated', t.tablename);
  end loop;
end;
$$;
revoke all on all tables in schema public from anon;
drop policy if exists update_own_profile on public.profiles;
revoke insert, update, delete on public.profiles, public.roles from authenticated;
-- Tokens de cobro únicamente desde servidor, nunca por clientes autenticados.
revoke all on public.integraciones_mp from authenticated;

alter view public.error_log_resumen set (security_invoker = true);
alter view public.voice_auditoria_diaria set (security_invoker = true);

alter function public.fn_inventario_touch() set search_path = '';
create or replace function public.recalc_transaccion_ganancia()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_tx_id uuid;
begin
  v_tx_id := coalesce(new.transaccion_id, old.transaccion_id);
  update public.transacciones t
  set ganancia_estimada_mxn = sub.ganancia_total,
      costo_total_mxn = sub.costo_total,
      tiene_items = sub.item_count > 0
  from (
    select coalesce(sum(ganancia_mxn),0)::numeric(14,2) as ganancia_total,
      coalesce(sum(coalesce(costo_unitario_snapshot_mxn,0)*cantidad),0)::numeric(14,2) as costo_total,
      count(*) as item_count
    from public.venta_items where transaccion_id = v_tx_id
  ) sub where t.id = v_tx_id;
  return null;
end;
$$;
revoke all on function public.fn_inventario_touch(), public.recalc_transaccion_ganancia() from public, anon, authenticated;

-- Los archivos privados tampoco son accesibles desde una sesión ajena antigua.
drop policy if exists solo_propietario on storage.objects;
create policy solo_propietario on storage.objects as restrictive
for all to authenticated
using ((select cabo_private.es_propietario_activo()))
with check ((select cabo_private.es_propietario_activo()));
revoke all on storage.objects, storage.buckets from anon;
commit;
