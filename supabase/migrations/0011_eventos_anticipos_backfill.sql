-- =============================================================
-- Migración 0011: Backfill anticipos del Excel histórico → eventos_pagos
-- =============================================================
-- Los 11 anticipos del WhatsApp que estaban solo en notas ahora se
-- convierten en pagos reales para que el dashboard refleje los $146,564
-- MXN + $2,780 MXN ya cobrados.
--
-- NO se crean transacciones automáticas para evitar contaminar el ingreso
-- de un mes específico (los anticipos fueron en fechas dispersas
-- desconocidas). Solo se registra el cobro contra el evento.
-- =============================================================

insert into eventos_pagos (evento_id, fecha_pago, monto, moneda, concepto)
select
  e.id,
  '2026-05-08'::date,
  x.monto,
  x.moneda,
  'Anticipo (capturado del Excel histórico)'
from eventos e
join (values
  ('Jesús Nazares Marín',                  '2026-05-30'::date, 10000.00, 'MXN'),
  ('Rosa Elena Jiménez Castillo',          '2026-06-20'::date,  9600.00, 'MXN'),
  ('Arón Lugo (Evento Jr)',                '2026-10-17'::date,  2780.00, 'MXN'),
  ('César Arón Orleta',                    '2026-11-07'::date, 20000.00, 'MXN'),
  ('David y Nicole Georgis',               '2026-11-13'::date, 15834.00, 'MXN'),
  ('Jennifer Stefanie Tadeo',              '2026-11-14'::date, 12600.00, 'MXN'),
  ('Yasmín Serrano',                       '2026-11-28'::date, 14500.00, 'MXN'),
  ('Mireya Sánchez',                       '2027-01-09'::date, 10400.00, 'MXN'),
  ('Alicia Soriano',                       '2027-01-16'::date,  5850.00, 'MXN'),
  ('Viviana Flores Torres',                '2027-01-23'::date, 16000.00, 'MXN'),
  ('Rosángeles Alegría Paredes Bojórquez', '2027-03-20'::date, 18900.00, 'MXN')
) as x(cliente, fecha, monto, moneda)
  on lower(trim(e.cliente_nombre)) = lower(trim(x.cliente))
  and e.fecha_evento = x.fecha
where not exists (
  select 1 from eventos_pagos ep
  where ep.evento_id = e.id and ep.concepto like 'Anticipo%'
);

-- =============================================================
-- Limpiar las notas de los eventos que ya tienen su pago registrado
-- (quita la línea "Anticipo $X · pago pendiente $Y" porque ahora es
-- visible en el módulo de pagos del evento)
-- =============================================================
update eventos e
set notas = null
where notas like '%Anticipo $%pago pendiente%'
  and exists (select 1 from eventos_pagos ep where ep.evento_id = e.id and ep.concepto like 'Anticipo%');

-- Para Arón Lugo (USD evento, MXN anticipo) ajustar nota
update eventos
set notas = 'Total $7,000 USD · anticipo en MXN'
where cliente_nombre ilike '%arón lugo%' or cliente_nombre ilike '%aron lugo%';
