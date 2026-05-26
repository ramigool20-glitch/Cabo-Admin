-- =============================================================
-- Migración 0006: Cuentas por Pagar (deudas a proveedores)
-- =============================================================

create table cuentas_por_pagar (
  id uuid primary key default gen_random_uuid(),
  proveedor text not null,
  proveedor_telefono text,
  proveedor_email text,
  negocio_id uuid references negocios(id),
  concepto text not null,
  monto_total numeric(12,2) not null,
  monto_pagado numeric(12,2) default 0,
  moneda text default 'MXN' check (moneda in ('MXN', 'USD')),
  fecha_emision date default current_date,
  fecha_vencimiento date,
  estado text default 'pendiente' check (estado in (
    'pendiente', 'parcial', 'pagado', 'vencido', 'cancelado'
  )),
  categoria text,
  referencia text,
  documento_url text,
  notas text,
  creado_por uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table cuentas_por_pagar_pagos (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid references cuentas_por_pagar(id) on delete cascade,
  fecha_pago date not null,
  monto numeric(12,2) not null,
  metodo_pago text,
  cuenta_origen_id uuid references cuentas(id),
  comprobante_url text,
  notas text,
  transaccion_id uuid references transacciones(id),
  pagado_por uuid references profiles(id),
  created_at timestamptz default now()
);

create index idx_cxp_estado on cuentas_por_pagar(estado);
create index idx_cxp_vencimiento on cuentas_por_pagar(fecha_vencimiento);
create index idx_cxp_proveedor on cuentas_por_pagar(proveedor);
create index idx_cxp_negocio on cuentas_por_pagar(negocio_id);
create index idx_cxp_pagos_cuenta on cuentas_por_pagar_pagos(cuenta_id);

alter table cuentas_por_pagar enable row level security;
alter table cuentas_por_pagar_pagos enable row level security;

create policy "select_autenticado" on cuentas_por_pagar       for select using (usuario_activo());
create policy "select_autenticado" on cuentas_por_pagar_pagos for select using (usuario_activo());
create policy "write_socio"        on cuentas_por_pagar       for all using (usuario_activo()) with check (usuario_activo());
create policy "write_socio"        on cuentas_por_pagar_pagos for all using (usuario_activo()) with check (usuario_activo());
