-- =============================================================
-- Migración 0039: Inventario de farmacia (Cvu Pharmacy local)
-- =============================================================
-- Catálogo de productos con stock, precio MXN, categoría y código de barras.
-- La conversión a USD se hace en la UI con el fx_rate del día.

create table if not exists inventario_productos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  precio_mxn numeric(10,2) not null default 0,
  stock integer not null default 0,
  unidad_stock text default 'unidad',          -- unidad, caja, frasco, etc.
  categoria text,                              -- GENERICO, PATENTE, OTC, Cuidado Personal, Bebidas, etc.
  codigo_barras text,
  negocio_id uuid references negocios(id),     -- a qué negocio pertenece (default Cvu Pharmacy local)
  activo boolean default true,
  stock_minimo integer default 3,              -- alerta cuando stock <= stock_minimo
  notas text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_inv_nombre on inventario_productos(lower(nombre));
create index if not exists idx_inv_categoria on inventario_productos(categoria);
create index if not exists idx_inv_codigo on inventario_productos(codigo_barras);
create index if not exists idx_inv_negocio on inventario_productos(negocio_id);

-- Mover updated_at automáticamente
create or replace function fn_inventario_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_inventario_touch on inventario_productos;
create trigger trg_inventario_touch before update on inventario_productos
  for each row execute function fn_inventario_touch();

alter table inventario_productos enable row level security;
drop policy if exists "select_autenticado" on inventario_productos;
drop policy if exists "write_admin" on inventario_productos;
create policy "select_autenticado" on inventario_productos for select using (usuario_activo());
create policy "write_admin" on inventario_productos for all using (usuario_activo()) with check (usuario_activo());

-- Historial de movimientos de stock (entrada/salida) — para auditoría posterior
create table if not exists inventario_movimientos (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references inventario_productos(id) on delete cascade,
  tipo text not null check (tipo in ('entrada', 'salida', 'ajuste', 'venta')),
  cantidad integer not null,                   -- positivo = entrada, negativo = salida
  precio_unitario numeric(10,2),               -- precio al momento del movimiento
  motivo text,
  transaccion_id uuid references transacciones(id) on delete set null,
  creado_por uuid references profiles(id),
  created_at timestamptz default now()
);
create index if not exists idx_inv_mov_producto on inventario_movimientos(producto_id, created_at desc);

alter table inventario_movimientos enable row level security;
drop policy if exists "select_autenticado" on inventario_movimientos;
drop policy if exists "write_admin" on inventario_movimientos;
create policy "select_autenticado" on inventario_movimientos for select using (usuario_activo());
create policy "write_admin" on inventario_movimientos for all using (usuario_activo()) with check (usuario_activo());
