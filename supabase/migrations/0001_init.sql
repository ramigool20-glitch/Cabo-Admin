-- =============================================================
-- Migración 0001: Schema inicial completo
-- App: Control de Gastos e Ingresos Multi-Negocio
-- Socios: Miguel y Sergio
-- Zona horaria operativa: America/Mazatlan (Los Cabos)
-- =============================================================

create extension if not exists "pgcrypto";

-- =============================================================
-- ROLES Y PERMISOS
-- =============================================================

create table roles (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (nombre in ('admin', 'socio', 'colaborador', 'lector')),
  descripcion text,
  permisos jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

insert into roles (nombre, descripcion, permisos) values
  ('admin',        'Acceso total: configuración, usuarios, todo.',
     '{"transacciones":{"read":true,"write":true,"delete":true},
       "negocios":{"read":true,"write":true},
       "cuentas":{"read":true,"write":true},
       "empleados":{"read":true,"write":true},
       "recurrentes":{"read":true,"write":true},
       "tareas":{"read":true,"write":true},
       "multas":{"read":true,"write":true},
       "auditor":{"read":true,"write":true},
       "config":{"read":true,"write":true},
       "usuarios":{"read":true,"write":true}}'::jsonb),
  ('socio',        'Socio del negocio: opera todo excepto admin de usuarios.',
     '{"transacciones":{"read":true,"write":true,"delete":true},
       "negocios":{"read":true,"write":true},
       "cuentas":{"read":true,"write":true},
       "empleados":{"read":true,"write":true},
       "recurrentes":{"read":true,"write":true},
       "tareas":{"read":true,"write":true},
       "multas":{"read":true,"write":true},
       "auditor":{"read":true,"write":true},
       "config":{"read":true,"write":true},
       "usuarios":{"read":true,"write":false}}'::jsonb),
  ('colaborador',  'Empleado: captura transacciones de su(s) negocio(s).',
     '{"transacciones":{"read":true,"write":true,"delete":false},
       "negocios":{"read":true,"write":false},
       "cuentas":{"read":true,"write":false},
       "empleados":{"read":false,"write":false},
       "recurrentes":{"read":false,"write":false},
       "tareas":{"read":true,"write":false},
       "multas":{"read":false,"write":false},
       "auditor":{"read":false,"write":false},
       "config":{"read":false,"write":false},
       "usuarios":{"read":false,"write":false}}'::jsonb),
  ('lector',       'Solo lectura: contador, auditor externo.',
     '{"transacciones":{"read":true,"write":false},
       "negocios":{"read":true,"write":false},
       "cuentas":{"read":true,"write":false},
       "empleados":{"read":true,"write":false},
       "recurrentes":{"read":true,"write":false},
       "tareas":{"read":true,"write":false},
       "multas":{"read":true,"write":false},
       "auditor":{"read":true,"write":false},
       "config":{"read":false,"write":false},
       "usuarios":{"read":false,"write":false}}'::jsonb);

-- =============================================================
-- PROFILES
-- =============================================================

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  role_id uuid references roles(id),
  negocios_acceso uuid[] default '{}',
  activo boolean default true,
  created_at timestamptz default now()
);

-- =============================================================
-- NEGOCIOS
-- =============================================================

create table negocios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo text not null check (tipo in ('farmacia', 'consultorio', 'pagina_digital', 'general')),
  activo boolean default true,
  hora_apertura time,
  hora_cierre time,
  dias_operacion int[] default '{1,2,3,4,5,6,7}',
  moneda_principal text default 'MXN' check (moneda_principal in ('MXN', 'USD')),
  notas text,
  created_at timestamptz default now()
);

insert into negocios (nombre, tipo, hora_apertura, hora_cierre, moneda_principal) values
  ('Farmacia',     'farmacia',       '09:00', '21:00', 'MXN'),
  ('Consultorio',  'consultorio',    '10:00', '20:00', 'MXN'),
  ('Página 1',     'pagina_digital', null,    null,    'MXN'),
  ('Página 2',     'pagina_digital', null,    null,    'MXN'),
  ('Página 3',     'pagina_digital', null,    null,    'MXN'),
  ('Página 4',     'pagina_digital', null,    null,    'MXN'),
  ('Página 5',     'pagina_digital', null,    null,    'MXN'),
  ('Página 6',     'pagina_digital', null,    null,    'MXN'),
  ('Página 7',     'pagina_digital', null,    null,    'MXN'),
  ('Página 8',     'pagina_digital', null,    null,    'USD'),
  ('General',      'general',        null,    null,    'MXN');

-- =============================================================
-- PARTICIPACIONES
-- =============================================================

create table participaciones (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid references negocios(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  porcentaje numeric(5,2) not null check (porcentaje >= 0 and porcentaje <= 100),
  vigente_desde date not null default current_date,
  vigente_hasta date,
  unique(negocio_id, profile_id, vigente_desde)
);

-- =============================================================
-- CUENTAS
-- =============================================================

create table cuentas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  titular text,
  tipo text check (tipo in ('mercado_pago', 'stripe', 'efectivo', 'banco', 'tarjeta', 'otra')),
  moneda text not null default 'MXN' check (moneda in ('MXN', 'USD')),
  activo boolean default true,
  notas text,
  created_at timestamptz default now()
);

insert into cuentas (nombre, titular, tipo, moneda) values
  ('Mercado Pago Edwin/Miguel', 'Miguel',  'mercado_pago', 'MXN'),
  ('Stripe Mercury',            'Sociedad','stripe',       'USD'),
  ('Mercado Pago Sergio',       'Sergio',  'mercado_pago', 'MXN'),
  ('Efectivo MXN',              null,      'efectivo',     'MXN'),
  ('Efectivo USD',              null,      'efectivo',     'USD');

-- =============================================================
-- TIPOS DE CAMBIO
-- =============================================================

create table tipos_cambio (
  fecha date primary key,
  usd_a_mxn numeric(10,4) not null,
  origen text default 'manual',
  created_at timestamptz default now()
);

-- =============================================================
-- TRANSACCIONES
-- =============================================================

create table transacciones (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('ingreso', 'gasto', 'multa_interna', 'liquidacion_socio')),
  monto numeric(12,2) not null,
  moneda text not null default 'MXN' check (moneda in ('MXN', 'USD')),
  tipo_cambio_aplicado numeric(10,4),
  fecha date not null default current_date,
  concepto text,
  negocio_id uuid references negocios(id),
  cuenta_id uuid references cuentas(id),
  metodo_pago text check (metodo_pago in (
    'stripe', 'mp_terminal', 'mp_transferencia', 'mp_link',
    'efectivo_mxn', 'efectivo_usd', 'transferencia_bancaria',
    'tarjeta', 'domiciliado', 'otro'
  )),
  categoria text,
  metodo_captura text check (metodo_captura in (
    'foto', 'voz', 'manual', 'recurrente', 'api', 'auditor', 'multa', 'liquidacion'
  )),
  foto_url text,
  audio_url text,
  raw_ai_response jsonb,
  notas text,
  capturado_por uuid references profiles(id),
  multa_id uuid,
  created_at timestamptz default now()
);

-- =============================================================
-- GASTOS RECURRENTES (módulo 3)
-- =============================================================

create table gastos_recurrentes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  monto numeric(12,2) not null,
  moneda text default 'MXN' check (moneda in ('MXN', 'USD')),
  negocio_id uuid references negocios(id),
  cuenta_id uuid references cuentas(id),
  responsable_id uuid references profiles(id),
  metodo_pago text,
  proveedor text,
  referencia_pago text,
  comprobante_requerido boolean default false,
  frecuencia text not null check (frecuencia in ('mensual', 'quincenal', 'semanal', 'anual')),
  dia_del_mes int,
  activo boolean default true,
  proximo_pago date,
  multa_por_no_pago numeric(12,2),
  categoria text,
  notas text,
  created_at timestamptz default now()
);

create table recurrentes_pagados (
  id uuid primary key default gen_random_uuid(),
  recurrente_id uuid references gastos_recurrentes(id) on delete cascade,
  fecha_pago date not null,
  monto_pagado numeric(12,2) not null,
  comprobante_url text,
  pagado_por uuid references profiles(id),
  transaccion_id uuid references transacciones(id),
  notas text,
  created_at timestamptz default now()
);

-- =============================================================
-- CORTES DIARIOS
-- =============================================================

create table cortes_diarios (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid references negocios(id),
  fecha date not null,
  venta_total numeric(12,2) not null,
  moneda text default 'MXN' check (moneda in ('MXN', 'USD')),
  num_transacciones int,
  efectivo numeric(12,2),
  tarjeta numeric(12,2),
  transferencia numeric(12,2),
  notas text,
  foto_url text,
  raw_ai_response jsonb,
  capturado_por uuid references profiles(id),
  created_at timestamptz default now(),
  unique(negocio_id, fecha)
);

-- =============================================================
-- VENTAS
-- =============================================================

create table ventas (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid references negocios(id),
  fecha date not null default current_date,
  producto text,
  precio_venta numeric(12,2) not null,
  moneda text default 'MXN' check (moneda in ('MXN', 'USD')),
  costo_producto numeric(12,2),
  cuenta_id uuid references cuentas(id),
  notas text,
  capturado_por uuid references profiles(id),
  created_at timestamptz default now()
);

-- =============================================================
-- GASTOS ADS
-- =============================================================

create table gastos_ads (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid references negocios(id),
  fecha date not null,
  monto numeric(12,2) not null,
  moneda text default 'USD' check (moneda in ('MXN', 'USD')),
  plataforma text default 'meta',
  metodo_captura text check (metodo_captura in ('foto', 'manual', 'api')),
  foto_url text,
  capturado_por uuid references profiles(id),
  created_at timestamptz default now()
);

-- =============================================================
-- EMPLEADOS Y NÓMINA
-- =============================================================

create table empleados (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  puesto text,
  activo boolean default true,
  fecha_ingreso date,
  notas text,
  created_at timestamptz default now()
);

create table empleado_compensacion (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid references empleados(id) on delete cascade,
  negocio_id uuid references negocios(id),
  sueldo_base numeric(12,2) default 0,
  moneda text default 'MXN' check (moneda in ('MXN', 'USD')),
  comision_porcentaje numeric(5,2) default 0,
  comision_base text check (comision_base in ('venta_total', 'utilidad', 'producto_especifico', 'fijo')),
  monto_fijo_comision numeric(12,2),
  frecuencia_pago text not null check (frecuencia_pago in ('mensual', 'quincenal', 'semanal')),
  dia_de_pago int,
  activo boolean default true,
  vigente_desde date default current_date,
  vigente_hasta date,
  created_at timestamptz default now()
);

create table pagos_nomina (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid references empleados(id),
  negocio_id uuid references negocios(id),
  fecha_pago date not null,
  periodo_inicio date,
  periodo_fin date,
  sueldo_base_pagado numeric(12,2) default 0,
  comision_pagada numeric(12,2) default 0,
  ventas_periodo numeric(12,2),
  total numeric(12,2) not null,
  moneda text default 'MXN' check (moneda in ('MXN', 'USD')),
  cuenta_id uuid references cuentas(id),
  notas text,
  capturado_por uuid references profiles(id),
  created_at timestamptz default now()
);

-- =============================================================
-- NOTIFICACIONES PUSH
-- =============================================================

create table notificaciones_programadas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('nomina', 'renta', 'recurrente', 'auditor', 'tarea', 'multa', 'custom')),
  titulo text not null,
  mensaje text not null,
  fecha_disparo timestamptz not null,
  destinatarios uuid[] not null,
  enviada boolean default false,
  enviada_at timestamptz,
  ref_tabla text,
  ref_id uuid,
  data jsonb,
  created_at timestamptz default now()
);

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz default now(),
  unique(endpoint)
);

-- =============================================================
-- AUDITOR IA
-- =============================================================

create table auditor_conversaciones (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id),
  rol text check (rol in ('user', 'assistant', 'system')),
  contenido text not null,
  tool_calls jsonb,
  created_at timestamptz default now()
);

create table auditor_pendientes (
  id uuid primary key default gen_random_uuid(),
  pregunta text not null,
  contexto text,
  dirigida_a uuid references profiles(id),
  prioridad text check (prioridad in ('alta', 'media', 'baja')),
  estado text default 'abierta' check (estado in ('abierta', 'contestada', 'descartada')),
  respuesta text,
  contestada_at timestamptz,
  created_at timestamptz default now()
);

-- =============================================================
-- TAREAS (módulo 1)
-- =============================================================

create table tareas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descripcion text,
  creada_por uuid references profiles(id),
  asignada_a uuid[] not null,
  fecha_limite timestamptz not null,
  prioridad text not null check (prioridad in ('alta', 'media', 'baja')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_progreso', 'completada', 'vencida')),
  negocio_id uuid references negocios(id),
  categoria text check (categoria in ('operativa', 'administrativa', 'pago', 'corte', 'auditoria', 'otra')),
  recurrente boolean default false,
  frecuencia_recurrente text check (frecuencia_recurrente in ('diaria', 'semanal', 'quincenal', 'mensual')),
  multa_monto numeric(12,2),
  moneda_multa text default 'MXN' check (moneda_multa in ('MXN', 'USD')),
  creada_por_auditor boolean default false,
  completada_at timestamptz,
  completada_por uuid references profiles(id),
  evidencia_url text,
  created_at timestamptz default now()
);

-- =============================================================
-- MULTAS (módulo 1)
-- =============================================================

create table multas (
  id uuid primary key default gen_random_uuid(),
  tarea_id uuid references tareas(id) on delete cascade,
  responsable_id uuid references profiles(id) not null,
  monto_propuesto numeric(12,2) not null,
  monto_final numeric(12,2),
  moneda text default 'MXN' check (moneda in ('MXN', 'USD')),
  motivo text not null,
  estado text not null default 'propuesta' check (estado in (
    'propuesta', 'aceptada', 'justificada', 'reduccion_solicitada',
    'aprobada', 'reducida', 'perdonada', 'pendiente_conversacion',
    'aplicada', 'cancelada'
  )),
  aprobada_por uuid references profiles(id),
  transaccion_id uuid references transacciones(id),
  responder_antes_de timestamptz,
  resuelta_at timestamptz,
  created_at timestamptz default now()
);

alter table transacciones
  add constraint transacciones_multa_id_fkey
  foreign key (multa_id) references multas(id) on delete set null;

create table multa_movimientos (
  id uuid primary key default gen_random_uuid(),
  multa_id uuid references multas(id) on delete cascade,
  actor_id uuid references profiles(id) not null,
  accion text not null check (accion in (
    'crear', 'aceptar', 'justificar', 'solicitar_reduccion',
    'aprobar', 'reducir', 'perdonar', 'disputar', 'liquidar', 'cancelar'
  )),
  monto_propuesto numeric(12,2),
  mensaje text,
  created_at timestamptz default now()
);

-- =============================================================
-- ÍNDICES
-- =============================================================

create index idx_transacciones_negocio_fecha on transacciones(negocio_id, fecha desc);
create index idx_transacciones_tipo_fecha   on transacciones(tipo, fecha desc);
create index idx_cortes_negocio_fecha       on cortes_diarios(negocio_id, fecha desc);
create index idx_ventas_negocio_fecha       on ventas(negocio_id, fecha desc);
create index idx_gastos_ads_negocio_fecha   on gastos_ads(negocio_id, fecha desc);
create index idx_recurrentes_proximo_pago   on gastos_recurrentes(proximo_pago) where activo = true;
create index idx_tareas_estado_limite       on tareas(estado, fecha_limite);
create index idx_tareas_asignada            on tareas using gin(asignada_a);
create index idx_multas_responsable_estado  on multas(responsable_id, estado);
create index idx_notif_disparo_pendiente    on notificaciones_programadas(fecha_disparo) where enviada = false;

-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================

alter table profiles                  enable row level security;
alter table negocios                  enable row level security;
alter table participaciones           enable row level security;
alter table cuentas                   enable row level security;
alter table tipos_cambio              enable row level security;
alter table transacciones             enable row level security;
alter table gastos_recurrentes        enable row level security;
alter table recurrentes_pagados       enable row level security;
alter table cortes_diarios            enable row level security;
alter table ventas                    enable row level security;
alter table gastos_ads                enable row level security;
alter table empleados                 enable row level security;
alter table empleado_compensacion     enable row level security;
alter table pagos_nomina              enable row level security;
alter table notificaciones_programadas enable row level security;
alter table push_subscriptions        enable row level security;
alter table auditor_conversaciones    enable row level security;
alter table auditor_pendientes        enable row level security;
alter table tareas                    enable row level security;
alter table multas                    enable row level security;
alter table multa_movimientos         enable row level security;
alter table roles                     enable row level security;

create or replace function es_socio_o_admin() returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from profiles p
    join roles r on r.id = p.role_id
    where p.id = auth.uid()
      and r.nombre in ('admin', 'socio')
      and p.activo = true
  );
$$;

create or replace function usuario_activo() returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from profiles where id = auth.uid() and activo = true
  );
$$;

create policy "select_autenticado" on profiles                  for select using (usuario_activo());
create policy "select_autenticado" on negocios                  for select using (usuario_activo());
create policy "select_autenticado" on participaciones           for select using (usuario_activo());
create policy "select_autenticado" on cuentas                   for select using (usuario_activo());
create policy "select_autenticado" on tipos_cambio              for select using (usuario_activo());
create policy "select_autenticado" on transacciones             for select using (usuario_activo());
create policy "select_autenticado" on gastos_recurrentes        for select using (usuario_activo());
create policy "select_autenticado" on recurrentes_pagados       for select using (usuario_activo());
create policy "select_autenticado" on cortes_diarios            for select using (usuario_activo());
create policy "select_autenticado" on ventas                    for select using (usuario_activo());
create policy "select_autenticado" on gastos_ads                for select using (usuario_activo());
create policy "select_autenticado" on empleados                 for select using (es_socio_o_admin());
create policy "select_autenticado" on empleado_compensacion     for select using (es_socio_o_admin());
create policy "select_autenticado" on pagos_nomina              for select using (es_socio_o_admin());
create policy "select_autenticado" on notificaciones_programadas for select using (usuario_activo());
create policy "select_autenticado" on push_subscriptions        for select using (profile_id = auth.uid());
create policy "select_autenticado" on auditor_conversaciones    for select using (es_socio_o_admin());
create policy "select_autenticado" on auditor_pendientes        for select using (usuario_activo());
create policy "select_autenticado" on tareas                    for select using (usuario_activo());
create policy "select_autenticado" on multas                    for select using (usuario_activo());
create policy "select_autenticado" on multa_movimientos         for select using (usuario_activo());
create policy "select_autenticado" on roles                     for select using (usuario_activo());

create policy "write_socio" on negocios              for all using (es_socio_o_admin()) with check (es_socio_o_admin());
create policy "write_socio" on participaciones       for all using (es_socio_o_admin()) with check (es_socio_o_admin());
create policy "write_socio" on cuentas               for all using (es_socio_o_admin()) with check (es_socio_o_admin());
create policy "write_socio" on tipos_cambio          for all using (es_socio_o_admin()) with check (es_socio_o_admin());
create policy "write_socio" on transacciones         for all using (usuario_activo())   with check (usuario_activo());
create policy "write_socio" on gastos_recurrentes    for all using (es_socio_o_admin()) with check (es_socio_o_admin());
create policy "write_socio" on recurrentes_pagados   for all using (usuario_activo())   with check (usuario_activo());
create policy "write_socio" on cortes_diarios        for all using (usuario_activo())   with check (usuario_activo());
create policy "write_socio" on ventas                for all using (usuario_activo())   with check (usuario_activo());
create policy "write_socio" on gastos_ads            for all using (usuario_activo())   with check (usuario_activo());
create policy "write_socio" on empleados             for all using (es_socio_o_admin()) with check (es_socio_o_admin());
create policy "write_socio" on empleado_compensacion for all using (es_socio_o_admin()) with check (es_socio_o_admin());
create policy "write_socio" on pagos_nomina          for all using (es_socio_o_admin()) with check (es_socio_o_admin());
create policy "write_socio" on tareas                for all using (usuario_activo())   with check (usuario_activo());
create policy "write_socio" on multas                for all using (es_socio_o_admin()) with check (es_socio_o_admin());
create policy "write_socio" on multa_movimientos     for all using (es_socio_o_admin()) with check (es_socio_o_admin());

create policy "own_push" on push_subscriptions for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "write_notif" on notificaciones_programadas for all using (es_socio_o_admin()) with check (es_socio_o_admin());
create policy "write_auditor_conv" on auditor_conversaciones for all using (es_socio_o_admin()) with check (es_socio_o_admin());
create policy "write_auditor_pend" on auditor_pendientes     for all using (usuario_activo())   with check (usuario_activo());

create policy "update_own_profile" on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Storage buckets a crear desde la UI de Supabase:
--   recibos, audios, comprobantes, evidencias (todos private)
