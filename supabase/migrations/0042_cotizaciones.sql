-- =============================================================
-- 0042: Cotizaciones por negocio + datos profesionales de empresa
--
-- Todo additive.
-- =============================================================

-- 1. Datos profesionales del negocio (footer del PDF/imagen)
alter table negocios
  add column if not exists rfc text,
  add column if not exists direccion text,
  add column if not exists telefono text,
  add column if not exists email text,
  add column if not exists slogan text,
  add column if not exists color_primario text,    -- HEX opcional para sobreescribir tipoMeta
  add column if not exists color_secundario text;

-- 2. Tabla de cotizaciones
create table if not exists cotizaciones (
  id uuid primary key default gen_random_uuid(),
  folio text not null,
  negocio_id uuid references negocios(id) on delete set null,
  cliente_nombre text not null,
  cliente_email text,
  cliente_telefono text,
  cliente_rfc text,
  cliente_direccion text,
  items jsonb not null default '[]'::jsonb,
  subtotal_mxn numeric(14,2) not null default 0,
  descuento_pct numeric(5,2) default 0,
  descuento_mxn numeric(14,2) default 0,
  iva_aplica boolean default false,
  iva_mxn numeric(14,2) default 0,
  total_mxn numeric(14,2) not null default 0,
  notas text,
  vigencia_dias int default 15,
  estado text default 'borrador'
    check (estado in ('borrador','enviada','aceptada','rechazada','expirada','convertida')),
  convertida_a_transaccion uuid references transacciones(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(folio)
);

create index if not exists idx_cot_neg     on cotizaciones(negocio_id, created_at desc);
create index if not exists idx_cot_folio   on cotizaciones(folio);
create index if not exists idx_cot_estado  on cotizaciones(estado);

alter table cotizaciones enable row level security;
drop policy if exists "select_autenticado" on cotizaciones;
drop policy if exists "write_admin" on cotizaciones;
create policy "select_autenticado" on cotizaciones for select using (usuario_activo());
create policy "write_admin" on cotizaciones for all using (usuario_activo()) with check (usuario_activo());

-- 3. Trigger updated_at
create or replace function set_cotizacion_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists trg_cotizacion_updated on cotizaciones;
create trigger trg_cotizacion_updated
  before update on cotizaciones
  for each row execute function set_cotizacion_updated_at();
