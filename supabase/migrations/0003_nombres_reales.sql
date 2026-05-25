-- =============================================================
-- Migración 0003: Nombres reales de los negocios + columna URL
-- =============================================================

-- Agregar columna url para guardar el dominio de las páginas digitales
alter table negocios add column if not exists url text;

-- Renombrar y asignar URLs
update negocios set
  nombre = 'Cvu Pharmacy local',
  notas  = 'Farmacia física en Cabo. Cortes diarios desde la cajera.'
where tipo = 'farmacia' and nombre = 'Farmacia';

update negocios set
  nombre = 'Cabo Walk-in Clinic',
  url    = 'https://cabowalkinclinic.com/',
  notas  = 'Clínica física + virtual.'
where tipo = 'consultorio' and nombre = 'Consultorio';

update negocios set
  nombre = 'Cvu Pharmacy online',
  url    = 'https://cvupharmacy.com'
where nombre = 'Página 1';

update negocios set
  nombre = 'CMC online',
  url    = 'https://cmcpharmacycabo.com/'
where nombre = 'Página 2';

update negocios set
  nombre = 'Cabo Pharmacy online',
  url    = 'https://pharmacycabo.com/'
where nombre = 'Página 3';

update negocios set
  nombre = 'IV Therapy Cabo',
  url    = 'https://ivtherapycabo.mx/'
where nombre = 'Página 4';

update negocios set
  nombre = 'Pharmacy Doctors',
  url    = 'https://pharmacydoctors.com/'
where nombre = 'Página 5';

-- Desactivar páginas no usadas (no se borran para preservar integridad referencial)
update negocios set activo = false
where nombre in ('Página 6', 'Página 7', 'Página 8');
