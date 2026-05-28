-- =============================================================
-- Migración 0024: Integraciones externas (Mercado Pago, WhatsApp)
-- =============================================================

-- Config de Mercado Pago por cuenta (cada cuenta MP tiene su token)
create table if not exists integraciones_mp (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid references cuentas(id) on delete cascade,
  nombre text not null,                       -- ej: "MP Sergio", "MP Edwin"
  access_token text not null,                 -- APP_USR-... de MP (producción)
  negocio_default_id uuid references negocios(id),  -- negocio al que se asignan los cobros
  mp_user_id text,                            -- id del usuario MP (se llena al validar)
  webhook_secret text,                        -- secret opcional para validar firma
  activa boolean default true,
  ultimo_sync timestamptz,
  cobros_count int default 0,                 -- cuántos cobros se han importado
  created_at timestamptz default now()
);
create index if not exists idx_int_mp_cuenta on integraciones_mp(cuenta_id);
create index if not exists idx_int_mp_activa on integraciones_mp(activa);

alter table integraciones_mp enable row level security;
drop policy if exists "select_autenticado" on integraciones_mp;
drop policy if exists "write_admin" on integraciones_mp;
create policy "select_autenticado" on integraciones_mp for select using (usuario_activo());
create policy "write_admin" on integraciones_mp for all using (usuario_activo()) with check (usuario_activo());

-- Log de pagos MP procesados (para dedup — no crear 2 tx del mismo cobro)
create table if not exists mp_pagos_procesados (
  id uuid primary key default gen_random_uuid(),
  mp_payment_id text not null unique,         -- id del pago en MP
  integracion_id uuid references integraciones_mp(id) on delete cascade,
  transaccion_id uuid references transacciones(id) on delete set null,
  monto numeric(14,2),
  moneda text,
  estado text,                                -- approved, refunded, etc.
  procesado_at timestamptz default now()
);
create index if not exists idx_mp_pagos_payment on mp_pagos_procesados(mp_payment_id);

alter table mp_pagos_procesados enable row level security;
drop policy if exists "select_autenticado" on mp_pagos_procesados;
drop policy if exists "write_admin" on mp_pagos_procesados;
create policy "select_autenticado" on mp_pagos_procesados for select using (usuario_activo());
create policy "write_admin" on mp_pagos_procesados for all using (usuario_activo()) with check (usuario_activo());

-- Log de mensajes WhatsApp entrantes (auditoría + dedup)
create table if not exists whatsapp_mensajes (
  id uuid primary key default gen_random_uuid(),
  wa_message_id text unique,
  from_number text,
  tipo text,                                  -- text, audio, image
  contenido text,                             -- texto o transcripción
  media_url text,
  interpretacion jsonb,                       -- lo que la IA extrajo
  transaccion_id uuid references transacciones(id) on delete set null,
  estado text default 'recibido',             -- recibido, procesado, error, ignorado
  created_at timestamptz default now()
);
create index if not exists idx_wa_msg_id on whatsapp_mensajes(wa_message_id);
create index if not exists idx_wa_from on whatsapp_mensajes(from_number);

alter table whatsapp_mensajes enable row level security;
drop policy if exists "select_autenticado" on whatsapp_mensajes;
drop policy if exists "write_admin" on whatsapp_mensajes;
create policy "select_autenticado" on whatsapp_mensajes for select using (usuario_activo());
create policy "write_admin" on whatsapp_mensajes for all using (usuario_activo()) with check (usuario_activo());

-- Números de WhatsApp autorizados (solo Miguel/Sergio pueden capturar)
create table if not exists whatsapp_autorizados (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,                -- formato internacional sin +, ej: 5216241234567
  profile_id uuid references profiles(id),
  nombre text,
  activo boolean default true,
  created_at timestamptz default now()
);
alter table whatsapp_autorizados enable row level security;
drop policy if exists "select_autenticado" on whatsapp_autorizados;
drop policy if exists "write_admin" on whatsapp_autorizados;
create policy "select_autenticado" on whatsapp_autorizados for select using (usuario_activo());
create policy "write_admin" on whatsapp_autorizados for all using (usuario_activo()) with check (usuario_activo());
