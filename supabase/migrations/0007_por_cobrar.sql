-- =============================================================
-- Migración 0007: Cuentas por Cobrar (dinero que nos deben clientes)
-- Espejo de por_pagar pero al revés.
-- =============================================================

create table if not exists cuentas_por_cobrar (
  id uuid primary key default gen_random_uuid(),
  cliente_nombre text not null,
  cliente_telefono text,
  cliente_email text,
  negocio_id uuid references negocios(id),
  concepto text not null,
  monto_total numeric(12,2) not null,
  monto_cobrado numeric(12,2) default 0,
  moneda text default 'MXN' check (moneda in ('MXN', 'USD')),
  fecha_emision date default current_date,
  fecha_vencimiento date,
  estado text default 'pendiente' check (estado in (
    'pendiente', 'parcial', 'cobrado', 'vencido', 'cancelado'
  )),
  categoria text,
  referencia text,
  documento_url text,
  notas text,
  creado_por uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists cuentas_por_cobrar_cobros (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid references cuentas_por_cobrar(id) on delete cascade,
  fecha_cobro date not null,
  monto numeric(12,2) not null,
  metodo_pago text,
  cuenta_destino_id uuid references cuentas(id),
  comprobante_url text,
  notas text,
  transaccion_id uuid references transacciones(id),
  cobrado_por uuid references profiles(id),
  created_at timestamptz default now()
);

create index if not exists idx_cxc_estado       on cuentas_por_cobrar(estado);
create index if not exists idx_cxc_vencimiento  on cuentas_por_cobrar(fecha_vencimiento);
create index if not exists idx_cxc_cliente      on cuentas_por_cobrar(cliente_nombre);
create index if not exists idx_cxc_negocio      on cuentas_por_cobrar(negocio_id);
create index if not exists idx_cxc_cobros_cuenta on cuentas_por_cobrar_cobros(cuenta_id);

alter table cuentas_por_cobrar enable row level security;
alter table cuentas_por_cobrar_cobros enable row level security;

drop policy if exists "select_autenticado" on cuentas_por_cobrar;
drop policy if exists "select_autenticado" on cuentas_por_cobrar_cobros;
drop policy if exists "write_socio"        on cuentas_por_cobrar;
drop policy if exists "write_socio"        on cuentas_por_cobrar_cobros;

create policy "select_autenticado" on cuentas_por_cobrar        for select using (usuario_activo());
create policy "select_autenticado" on cuentas_por_cobrar_cobros for select using (usuario_activo());
create policy "write_socio"        on cuentas_por_cobrar        for all    using (usuario_activo()) with check (usuario_activo());
create policy "write_socio"        on cuentas_por_cobrar_cobros for all    using (usuario_activo()) with check (usuario_activo());
