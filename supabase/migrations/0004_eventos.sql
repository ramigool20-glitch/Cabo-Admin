-- =============================================================
-- Migración 0004: Módulo de Eventos (Rancho McCoy)
-- Bodas / eventos con anticipos. Modelo: gestionan el lugar, ganan 25%.
-- 75% va al proveedor del lugar.
-- =============================================================

create table eventos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid references negocios(id) not null,
  cliente_nombre text not null,
  cliente_telefono text,
  cliente_email text,
  tipo_evento text,                                -- boda, evento privado, etc.
  fecha_evento date not null,
  hora_evento time,
  monto_total numeric(12,2) not null,             -- precio del evento al cliente
  moneda text default 'MXN' check (moneda in ('MXN', 'USD')),
  comision_porcentaje numeric(5,2) default 25,    -- % para los socios
  proveedor_nombre text,                          -- dueño del lugar
  proveedor_pagado boolean default false,
  estado text not null default 'reservado' check (estado in (
    'reservado',      -- cliente reservó con anticipo
    'confirmado',     -- pagó completo
    'realizado',      -- ya pasó el evento
    'pagado_proveedor', -- ya se le pagó al dueño del lugar
    'cancelado'
  )),
  notas text,
  creado_por uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table eventos_pagos (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid references eventos(id) on delete cascade,
  fecha_pago date not null,
  monto numeric(12,2) not null,
  moneda text default 'MXN' check (moneda in ('MXN', 'USD')),
  metodo_pago text,
  cuenta_id uuid references cuentas(id),
  concepto text,                                   -- "Anticipo", "Pago final", etc.
  comprobante_url text,
  transaccion_id uuid references transacciones(id),
  capturado_por uuid references profiles(id),
  created_at timestamptz default now()
);

create index idx_eventos_fecha on eventos(fecha_evento);
create index idx_eventos_negocio on eventos(negocio_id);
create index idx_eventos_estado on eventos(estado);
create index idx_eventos_pagos_evento on eventos_pagos(evento_id);

-- RLS
alter table eventos enable row level security;
alter table eventos_pagos enable row level security;

create policy "select_autenticado" on eventos      for select using (usuario_activo());
create policy "select_autenticado" on eventos_pagos for select using (usuario_activo());

create policy "write_socio" on eventos      for all using (es_socio_o_admin()) with check (es_socio_o_admin());
create policy "write_socio" on eventos_pagos for all using (usuario_activo())   with check (usuario_activo());
