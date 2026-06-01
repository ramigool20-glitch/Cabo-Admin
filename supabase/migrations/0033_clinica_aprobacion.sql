-- =============================================================
-- Migración 0033: Aprobación con foto + propinas en corte separado.
-- =============================================================
-- Aprobación: cuando registra la enfermera, queda 'pendiente' con foto.
-- Admin aprueba/rechaza. Solo 'aprobado' cuenta en tabulador/cortes.
-- Propinas: ahora se pueden cortar aparte de las comisiones (mismo row,
-- columnas distintas pago_id vs propina_pago_id).
-- =============================================================

-- Aprobación
alter table clinica_realizados
  add column if not exists estado_aprobacion text not null default 'aprobado'
    check (estado_aprobacion in ('pendiente', 'aprobado', 'rechazado'));
alter table clinica_realizados add column if not exists foto_url text;
alter table clinica_realizados add column if not exists aprobado_por uuid references profiles(id);
alter table clinica_realizados add column if not exists aprobado_at timestamptz;
alter table clinica_realizados add column if not exists motivo_rechazo text;

-- Corte de propinas independiente (pago_id sigue siendo para comisiones)
alter table clinica_realizados
  add column if not exists propina_pago_id uuid references clinica_pagos(id) on delete set null;

create index if not exists idx_realizados_estado_aprobacion
  on clinica_realizados(estado_aprobacion, created_at desc)
  where estado_aprobacion = 'pendiente';
create index if not exists idx_realizados_propina_pago
  on clinica_realizados(enfermera_id, propina_pago_id);
