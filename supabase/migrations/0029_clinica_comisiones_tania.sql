-- =============================================================
-- Migración 0029: Comisiones reales de Patricia (normal/guardia) + Tania
-- =============================================================

-- 1) Columna para comisión fuera de horario (guardias)
alter table clinica_servicios
  add column if not exists comision_fuera_horario numeric(12,2);

-- 2) IV Therapy: $250 normal / $700 fuera de horario
update clinica_servicios
set comision_enfermera = 250, comision_fuera_horario = 700
where categoria = 'iv';

-- 3) Inyecciones: $60 / $350
update clinica_servicios
set comision_enfermera = 60, comision_fuera_horario = 350
where categoria = 'inyeccion';

-- 4) Procedimientos de enfermería que faltan (con ambas tarifas)
insert into clinica_servicios (categoria, nombre_es, nombre_en, comision_enfermera, comision_fuera_horario, moneda_precio, para_que_sirve, orden) values
  ('enfermeria', 'Nebulizacion', 'Nebulization', 100, 390, 'MXN', 'Tratamiento respiratorio con nebulizador.', 61),
  ('enfermeria', 'Curacion menor', 'Minor Wound Care', 120, 400, 'MXN', 'Curacion de herida menor.', 62),
  ('enfermeria', 'Curacion mayor', 'Major Wound Care', 1000, 1800, 'MXN', 'Curacion de herida mayor / post-quirurgica.', 63),
  ('enfermeria', 'Lavado otico', 'Ear Wash', 120, 300, 'MXN', 'Lavado de oidos.', 64)
on conflict do nothing;

-- 5) La curación genérica que ya existía: alinear a menor (120/400)
update clinica_servicios
set comision_enfermera = 120, comision_fuera_horario = 400
where categoria = 'enfermeria' and lower(nombre_es) like '%curacion / cuidado%';

-- 6) Renombrar la cajera a Tania
update empleados
set nombre = 'Tania', puesto = 'Cajera Cvu Pharmacy local'
where lower(nombre) like '%cajera%';
