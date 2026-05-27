-- =============================================================
-- Migración 0010: Detalles extra de eventos + carga inicial Rancho McCoy
-- =============================================================
-- Añade columnas num_personas, duracion_horas, paquete
-- Inserta los 14 eventos confirmados de Rancho McCoy (May 2026 - Mar 2027)
-- =============================================================

-- 1) Nuevas columnas
alter table eventos
  add column if not exists num_personas integer,
  add column if not exists duracion_horas integer,
  add column if not exists paquete text;

create index if not exists idx_eventos_paquete on eventos(paquete);

-- 2) Insertar eventos (idempotente: no duplica si ya existe cliente + fecha)
insert into eventos (
  negocio_id, cliente_nombre, cliente_telefono, fecha_evento,
  monto_total, moneda, num_personas, duracion_horas, paquete, notas, estado, comision_porcentaje
)
select
  n.id, x.cliente, x.tel, x.fecha::date,
  x.total, x.moneda, x.personas, x.horas, x.paquete, x.notas, x.estado, 25
from negocios n
cross join (values
  -- (cliente, telefono, fecha, total, moneda, personas, horas, paquete, notas, estado)
  ('Jesús Nazares Marín',              null,           '2026-05-30', 35000,  'MXN', 100, 11, 'ELIT con sesión de fotos',           'Anticipo $10,000 · pago pendiente $25,000',  'reservado'),
  ('Rosa Elena Jiménez Castillo',      '6241568013',   '2026-06-20', 24000,  'MXN',  60, null, 'Empieza a las 3PM',                  'Anticipo $9,600 · pago pendiente $14,400',   'reservado'),
  ('Erick Seseña',                     null,           '2026-08-01', 0,      'MXN', 150, null, null,                                  'Pendiente de cotizar',                       'reservado'),
  ('Pepe Fiesta',                      null,           '2026-10-03', 0,      'MXN', null, null, null,                                 'Pendiente de cotizar',                       'reservado'),
  ('Pepe Fiesta',                      null,           '2026-10-10', 0,      'MXN', null, null, null,                                 'Pendiente de cotizar',                       'reservado'),
  ('Arón Lugo (Evento Jr)',            '15034005683',  '2026-10-17', 7000,   'USD',  50, 10,   'Con comida, decoración y sillas Crosback', 'Anticipo $2,780 · total $7,000 USD',    'reservado'),
  ('César Arón Orleta',                '3334440770',   '2026-11-07', 37000,  'MXN',  51, 10,   'Cabañas con show',                    'Anticipo $20,000 · pago pendiente $23,610',  'reservado'),
  ('David y Nicole Georgis',           '9982019509',   '2026-11-13', 45500,  'MXN', 150, 11,   'ELIT',                                'Anticipo $15,834 · pago pendiente $29,666',  'reservado'),
  ('Jennifer Stefanie Tadeo',          '6242187452',   '2026-11-14', 37000,  'MXN', 100, 8,    '2 cabañas, mobiliario, 4 meseros 5hrs', 'Anticipo $12,600 · pago pendiente $24,400', 'reservado'),
  ('Yasmín Serrano',                   null,           '2026-11-28', 48500,  'MXN', 200, 8,    'VIP',                                 'Anticipo $14,500 · pago pendiente $34,000',  'reservado'),
  ('Mireya Sánchez',                   '6122285044',   '2027-01-09', 115000, 'MXN', 100, 10,   'De 5PM a 3AM',                        'Anticipo $10,400 · pago pendiente $104,600', 'reservado'),
  ('Alicia Soriano',                   '6242400813',   '2027-01-16', 19500,  'MXN', 100, 6,    'PLATINO',                             'Anticipo $5,850 · pago pendiente $13,650',   'reservado'),
  ('Viviana Flores Torres',            '6242106560',   '2027-01-23', 52400,  'MXN', 150, 11,   'ELITE',                               'Anticipo $16,000 · pago pendiente $36,400',  'reservado'),
  ('Rosángeles Alegría Paredes Bojórquez','6241089344','2027-03-20', 63000,  'MXN', 220, 11,   'ELITE 2 cabañas',                     'Anticipo $18,900 · pago pendiente $44,100',  'reservado')
) as x(cliente, tel, fecha, total, moneda, personas, horas, paquete, notas, estado)
where (n.nombre ilike '%rancho%' or n.tipo = 'salon_eventos')
  and not exists (
    select 1 from eventos e
    where e.fecha_evento = x.fecha::date
      and lower(trim(e.cliente_nombre)) = lower(trim(x.cliente))
  );
