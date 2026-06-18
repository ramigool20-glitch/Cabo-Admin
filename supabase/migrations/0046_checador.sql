-- =============================================================
-- 0046: Checador de empleados con horarios + retardos + multas
-- =============================================================

-- 1. Horarios de empleados (1 fila por empleado activo)
create table if not exists horarios_empleado (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  hora_entrada time not null default '09:00',
  hora_salida time not null default '17:00',
  tolerancia_minutos int default 15,
  dias_semana int[] default '{1,2,3,4,5,6}', -- 1=Lun ... 7=Dom
  retardos_para_multa int default 3,
  monto_multa_mxn numeric(10,2) default 100,
  activo boolean default true,
  created_at timestamptz default now(),
  unique(profile_id)
);

create index if not exists idx_horarios_prof on horarios_empleado(profile_id) where activo = true;

alter table horarios_empleado enable row level security;
drop policy if exists "select_autenticado" on horarios_empleado;
drop policy if exists "write_admin" on horarios_empleado;
create policy "select_autenticado" on horarios_empleado for select using (usuario_activo());
create policy "write_admin" on horarios_empleado for all using (usuario_activo()) with check (usuario_activo());

-- 2. Registro de checadas
create table if not exists checadas (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  profile_nombre text,
  tipo text not null check (tipo in ('entrada','salida')),
  timestamp_at timestamptz default now() not null,
  esperado_at timestamptz,
  retardo_minutos int default 0,
  es_retardo boolean default false,
  biometrico_verificado boolean default false,
  foto_url text,   -- path en storage para evidencia (estado físico al checar)
  notas text,
  ip_address text,
  created_at timestamptz default now()
);

create index if not exists idx_check_prof on checadas(profile_id, timestamp_at desc);
-- Nota: no usamos índice sobre date(timestamp_at) porque date() no es
-- IMMUTABLE para timestamptz (depende de timezone de la sesión).
-- El índice de arriba cubre las queries por profile + rango de tiempo.

alter table checadas enable row level security;
drop policy if exists "select_autenticado" on checadas;
drop policy if exists "write_admin" on checadas;
create policy "select_autenticado" on checadas for select using (usuario_activo());
create policy "write_admin" on checadas for all using (usuario_activo()) with check (usuario_activo());

-- 3. Default horario para Tania (cajera)
insert into horarios_empleado (profile_id, hora_entrada, hora_salida, tolerancia_minutos)
select id, '09:00', '17:00', 15
from profiles
where nombre = 'Tania' and activo = true
on conflict (profile_id) do nothing;
