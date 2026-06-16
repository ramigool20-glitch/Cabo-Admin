-- =============================================================
-- Migración 0038: Log de webhooks y crones para diagnóstico
-- =============================================================
-- Toda llamada al webhook (real o intento) y toda corrida del cron
-- mp-sync queda registrada aquí. Permite ver retrasos, errores y
-- comportamientos raros sin depender de los logs de Vercel.

create table if not exists webhook_log (
  id uuid primary key default gen_random_uuid(),
  fuente text not null,                       -- 'webhook_mp', 'cron_mp_sync', 'webhook_stripe', etc.
  integracion_id uuid,                        -- FK suelta (no constraint) por si se borró la integ
  status int,                                  -- 200, 401, 500, etc.
  ok boolean,                                  -- true si todo bien, false si error
  http_method text,                            -- POST, GET
  request_url text,                            -- URL completa con query params
  request_body jsonb,                          -- body recibido (json)
  request_signature text,                      -- x-signature header (truncado)
  signature_valid boolean,                     -- null = no se intentó validar
  payment_id text,                             -- mp_payment_id si aplica
  payment_type text,                           -- type del evento (payment, money_transfer, etc.)
  resultado jsonb,                             -- { creada, ok, error, ... }
  error text,
  duracion_ms int,                             -- tiempo que tardó el handler
  created_at timestamptz default now()
);

create index if not exists idx_wh_log_fuente_at on webhook_log(fuente, created_at desc);
create index if not exists idx_wh_log_integ on webhook_log(integracion_id, created_at desc);
create index if not exists idx_wh_log_payment on webhook_log(payment_id);

alter table webhook_log enable row level security;
drop policy if exists "select_autenticado" on webhook_log;
drop policy if exists "write_admin" on webhook_log;
create policy "select_autenticado" on webhook_log for select using (usuario_activo());
create policy "write_admin" on webhook_log for all using (usuario_activo()) with check (usuario_activo());
