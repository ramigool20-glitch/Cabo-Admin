-- =============================================================
-- Migración 0028: Nómina completa (cajera + Doña Rossy) + pagos + extras
-- =============================================================

-- 1) Cajera de farmacia
insert into empleados (nombre, puesto, activo, fecha_ingreso)
select 'Cajera Farmacia', 'Cajera', true, current_date
where not exists (select 1 from empleados where lower(nombre) like '%cajera%');

insert into empleado_compensacion (empleado_id, sueldo_base, moneda, frecuencia_pago, comision_porcentaje, comision_base, activo)
select e.id, 2200, 'MXN', 'semanal', 4, 'venta_total', true
from empleados e
where lower(e.nombre) like '%cajera%'
  and not exists (select 1 from empleado_compensacion c where c.empleado_id = e.id and c.activo = true);

-- 2) Doña Rossy (casa)
insert into empleados (nombre, puesto, activo, fecha_ingreso)
select 'Dona Rossy', 'Servicio de casa', true, current_date
where not exists (select 1 from empleados where lower(nombre) like '%rossy%');

insert into empleado_compensacion (empleado_id, sueldo_base, moneda, frecuencia_pago, comision_porcentaje, activo)
select e.id, 3800, 'MXN', 'semanal', 0, true
from empleados e
where lower(e.nombre) like '%rossy%'
  and not exists (select 1 from empleado_compensacion c where c.empleado_id = e.id and c.activo = true);

-- 3) Tabla de pagos de nómina (corte por periodo, marca pagado)
create table if not exists nomina_pagos (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid references empleados(id) on delete cascade,
  periodo_inicio date not null,
  periodo_fin date not null,
  sueldo_base numeric(12,2) default 0,
  comisiones numeric(12,2) default 0,
  propinas numeric(12,2) default 0,
  bono numeric(12,2) default 0,
  extras numeric(12,2) default 0,
  total numeric(12,2) default 0,
  moneda text default 'MXN',
  pagado boolean default false,
  fecha_pago date,
  transaccion_id uuid references transacciones(id) on delete set null,
  notas text,
  created_at timestamptz default now()
);
create index if not exists idx_nomina_pagos_emp on nomina_pagos(empleado_id);
create index if not exists idx_nomina_pagos_periodo on nomina_pagos(periodo_inicio);

alter table nomina_pagos enable row level security;
drop policy if exists "select_autenticado" on nomina_pagos;
drop policy if exists "write_admin" on nomina_pagos;
create policy "select_autenticado" on nomina_pagos for select using (usuario_activo());
create policy "write_admin" on nomina_pagos for all using (usuario_activo()) with check (usuario_activo());

-- 4) Extras / bonos one-off (ej: dinero para comida de Doña Rossy)
create table if not exists empleado_extras (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid references empleados(id) on delete cascade,
  fecha date not null default current_date,
  concepto text not null,
  monto numeric(12,2) not null,
  moneda text default 'MXN',
  pagado boolean default false,
  aprobado_por uuid references profiles(id),
  created_at timestamptz default now()
);
create index if not exists idx_emp_extras on empleado_extras(empleado_id);

alter table empleado_extras enable row level security;
drop policy if exists "select_autenticado" on empleado_extras;
drop policy if exists "write_admin" on empleado_extras;
create policy "select_autenticado" on empleado_extras for select using (usuario_activo());
create policy "write_admin" on empleado_extras for all using (usuario_activo()) with check (usuario_activo());
