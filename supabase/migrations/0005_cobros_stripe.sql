-- =============================================================
-- Migración 0005: Cobros vía Stripe (links de pago + QR)
-- =============================================================

create table cobros_stripe (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid references negocios(id),
  cliente_nombre text,
  cliente_email text,
  cliente_telefono text,
  descripcion text not null,
  monto numeric(12,2) not null,
  moneda text not null default 'USD' check (moneda in ('MXN', 'USD')),
  estado text not null default 'pendiente' check (estado in (
    'pendiente',  -- link creado, esperando pago
    'cobrado',    -- pago completado
    'expirado',   -- session expiró sin pago
    'cancelado'   -- usuario canceló
  )),
  stripe_session_id text unique,
  stripe_payment_intent_id text,
  payment_url text,
  qr_url text,                          -- data URL del QR generado
  cobrado_at timestamptz,
  expira_at timestamptz,
  metadata jsonb,
  transaccion_id uuid references transacciones(id),
  creado_por uuid references profiles(id),
  created_at timestamptz default now()
);

create index idx_cobros_stripe_estado on cobros_stripe(estado);
create index idx_cobros_stripe_session on cobros_stripe(stripe_session_id);
create index idx_cobros_stripe_created on cobros_stripe(created_at desc);

alter table cobros_stripe enable row level security;

create policy "select_autenticado" on cobros_stripe for select using (usuario_activo());
create policy "write_socio"         on cobros_stripe for all using (usuario_activo()) with check (usuario_activo());
