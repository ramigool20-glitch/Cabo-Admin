-- =============================================================
-- 0044: Rol cajera + Tabla cortes_caja (POS-4 + POS-5)
-- =============================================================

-- 1. Ampliar check constraint para aceptar 'cajera'
alter table roles drop constraint if exists roles_nombre_check;
alter table roles add constraint roles_nombre_check
  check (nombre in ('admin', 'socio', 'colaborador', 'lector', 'enfermera', 'cajera'));

-- 2. Asegurar que existe el rol "cajera"
insert into roles (nombre, descripcion)
  values ('cajera', 'Cajera del POS — solo acceso a /pos')
  on conflict (nombre) do nothing;

-- 2. Tabla de cortes de caja del POS
create table if not exists cortes_caja (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid references negocios(id) on delete set null,
  cajera_id uuid references profiles(id) on delete set null,
  cajera_nombre text,

  -- Periodo del turno
  fecha date not null default current_date,
  apertura_at timestamptz,
  cierre_at timestamptz default now(),

  -- Esperado (calculado de venta_items + transacciones)
  esperado_efectivo_mxn numeric(14,2) default 0,
  esperado_mp_mxn       numeric(14,2) default 0,
  esperado_tarjeta_mxn  numeric(14,2) default 0,
  esperado_transfer_mxn numeric(14,2) default 0,
  esperado_total_mxn    numeric(14,2) default 0,

  -- Contado (lo que la cajera reporta)
  contado_efectivo_mxn numeric(14,2),
  contado_mp_mxn       numeric(14,2),
  contado_tarjeta_mxn  numeric(14,2),

  -- Diferencias (esperado - contado, positivo = falta, negativo = sobra)
  diferencia_efectivo_mxn numeric(14,2),
  diferencia_total_mxn    numeric(14,2),

  -- Contexto adicional
  ventas_count int default 0,
  unidades_vendidas int default 0,
  ganancia_estimada_mxn numeric(14,2) default 0,

  notas text,
  estado text default 'cerrado' check (estado in ('abierto','cerrado')),

  created_at timestamptz default now()
);

create index if not exists idx_corte_neg on cortes_caja(negocio_id, fecha desc);
create index if not exists idx_corte_caj on cortes_caja(cajera_id, fecha desc);

alter table cortes_caja enable row level security;
drop policy if exists "select_autenticado" on cortes_caja;
drop policy if exists "write_admin" on cortes_caja;
create policy "select_autenticado" on cortes_caja for select using (usuario_activo());
create policy "write_admin" on cortes_caja for all using (usuario_activo()) with check (usuario_activo());
