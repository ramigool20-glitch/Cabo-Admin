-- =============================================================
-- Migración 0027: Rol enfermera + Patricia (config, nómina)
-- =============================================================

-- 1) Agregar rol 'enfermera' (acceso solo a Clínica)
alter table roles drop constraint if exists roles_nombre_check;
alter table roles add constraint roles_nombre_check
  check (nombre in ('admin', 'socio', 'colaborador', 'lector', 'enfermera'));

insert into roles (nombre, descripcion, permisos) values
  ('enfermera', 'Acceso limitado: solo módulo Clínica (catálogo, registrar servicios, su tabulador, tareas).',
   '{"clinica":{"read":true,"write":true},"tareas":{"read":true,"write":true}}'::jsonb)
on conflict (nombre) do nothing;

-- 2) Patricia en empleados (si no existe)
insert into empleados (nombre, puesto, activo, fecha_ingreso)
select 'Patricia Mora Lopez', 'Enfermera', true, current_date
where not exists (
  select 1 from empleados where lower(nombre) like '%patricia%mora%'
);

-- 3) Compensación: sueldo base $9,750 MXN quincenal (pagado 15 y 30)
insert into empleado_compensacion (empleado_id, sueldo_base, moneda, frecuencia_pago, dia_de_pago, activo)
select e.id, 9750, 'MXN', 'quincenal', 15, true
from empleados e
where lower(e.nombre) like '%patricia%mora%'
  and not exists (
    select 1 from empleado_compensacion c where c.empleado_id = e.id and c.activo = true
  );

-- 4) Config de comisiones de la enfermera (sueldo + bono review)
insert into clinica_config_enfermera (nombre, sueldo_base_quincenal, bono_por_review, reviews_acumuladas, activa, notas)
select 'Patricia Mora Lopez', 9750, 50, 0, true, 'Sueldo base $9,750 MXN quincenal (días 15 y 30). Bono $50 por review, paquete de 10 desbloquea bono.'
where not exists (
  select 1 from clinica_config_enfermera where lower(nombre) like '%patricia%'
);
