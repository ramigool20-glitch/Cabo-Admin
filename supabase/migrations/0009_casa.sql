-- =============================================================
-- Migración 0009: Negocio "Casa" para roomates
-- =============================================================
-- Miguel y Sergio comparten casa. Cada gasto registrado en este negocio
-- se considera para el balance de roomates (50/50 default).
-- La página /casa muestra "Miguel puso X, Sergio puso Y, le debe Z para empatar".
-- =============================================================

-- 1) Permitir tipo 'casa' (y salon_eventos por si Rancho McCoy ya estaba como otro tipo)
alter table negocios drop constraint if exists negocios_tipo_check;
alter table negocios add constraint negocios_tipo_check
  check (tipo in ('farmacia', 'consultorio', 'pagina_digital', 'general', 'casa', 'salon_eventos'));

-- 2) Insertar Casa (idempotente: solo si no existe)
insert into negocios (nombre, tipo, moneda_principal, activo)
select 'Casa', 'casa', 'MXN', true
where not exists (select 1 from negocios where tipo = 'casa');

-- 3) Tabla de shopping list compartida
create table if not exists casa_shopping (
  id uuid primary key default gen_random_uuid(),
  item text not null,
  cantidad text,
  prioridad text default 'normal' check (prioridad in ('alta', 'normal', 'baja')),
  agregado_por uuid references profiles(id),
  comprado boolean default false,
  comprado_at timestamptz,
  comprado_por uuid references profiles(id),
  transaccion_id uuid references transacciones(id),
  notas text,
  created_at timestamptz default now()
);

create index if not exists idx_casa_shopping_comprado on casa_shopping(comprado);
create index if not exists idx_casa_shopping_created  on casa_shopping(created_at desc);

alter table casa_shopping enable row level security;

drop policy if exists "select_autenticado" on casa_shopping;
drop policy if exists "write_socio"        on casa_shopping;

create policy "select_autenticado" on casa_shopping for select using (usuario_activo());
create policy "write_socio"        on casa_shopping for all    using (usuario_activo()) with check (usuario_activo());
