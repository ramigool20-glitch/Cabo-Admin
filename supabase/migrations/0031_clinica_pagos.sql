-- =============================================================
-- Migración 0031: Pagos a la enfermera (comisiones semanales + sueldo
-- quincenal). El tablero de Patricia se reinicia al marcar pagado.
-- =============================================================

create table if not exists clinica_pagos (
  id uuid primary key default gen_random_uuid(),
  enfermera_id uuid references profiles(id),
  tipo text not null check (tipo in ('comisiones', 'sueldo_quincenal')),
  periodo_inicio date not null,
  periodo_fin date not null,
  monto_comisiones numeric(12,2) default 0,    -- suma de pago_comision de servicios (sin reviews)
  monto_propinas numeric(12,2) default 0,
  monto_reviews numeric(12,2) default 0,        -- 0 si las dejaron para la siguiente semana
  monto_sueldo_base numeric(12,2) default 0,
  monto_total numeric(12,2) not null,
  incluye_reviews boolean default true,
  notas text,
  transaccion_id uuid references transacciones(id),  -- el gasto generado
  pagado_por uuid references profiles(id),
  created_at timestamptz default now()
);
create index if not exists idx_clinica_pagos_enfermera on clinica_pagos(enfermera_id, created_at desc);
create index if not exists idx_clinica_pagos_periodo on clinica_pagos(tipo, periodo_inicio);

alter table clinica_pagos enable row level security;
create policy "select_autenticado" on clinica_pagos for select using (usuario_activo());
create policy "write_socio" on clinica_pagos for all using (usuario_activo()) with check (usuario_activo());

-- Marca cuándo se pagó cada servicio/reseña (null = sigue pendiente de pago)
alter table clinica_realizados add column if not exists pagado_at timestamptz;
alter table clinica_realizados add column if not exists pago_id uuid references clinica_pagos(id) on delete set null;
create index if not exists idx_realizados_pagado_at on clinica_realizados(enfermera_id, pagado_at);
