-- =============================================================
-- Migración 0032: Cortes con 2 pasos (cortar → pagar) + cancelable.
-- =============================================================
-- Antes: cada clinica_pagos era inmediatamente "pagado".
-- Ahora: estado puede ser 'pendiente' (corte hecho, no pagado), 'pagado'
-- o 'cancelado'. Los registros existentes quedan como 'pagado' (correcto).
-- =============================================================

alter table clinica_pagos
  add column if not exists estado text not null default 'pagado'
    check (estado in ('pendiente', 'pagado', 'cancelado'));

create index if not exists idx_clinica_pagos_estado
  on clinica_pagos(estado, created_at desc);
