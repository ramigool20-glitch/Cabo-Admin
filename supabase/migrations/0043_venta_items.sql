-- =============================================================
-- 0043: Items de venta — conexión inventario ⇄ transacciones
--
-- Todo additive. Las transacciones existentes siguen funcionando
-- (tiene_items = false por default).
--
-- Modelo:
--   transacciones (1) ───< venta_items (N) >─── inventario_productos (1)
--
-- Snapshot del costo al momento de vender → ganancia histórica
-- queda correcta aunque el costo cambie después.
-- =============================================================

-- Columnas extra en transacciones
alter table transacciones
  add column if not exists ganancia_estimada_mxn numeric(14,2),
  add column if not exists costo_total_mxn numeric(14,2),
  add column if not exists tiene_items boolean default false;

create index if not exists idx_tx_tiene_items
  on transacciones(tiene_items, fecha desc)
  where tiene_items = true;

-- Tabla venta_items
create table if not exists venta_items (
  id uuid primary key default gen_random_uuid(),
  transaccion_id uuid not null references transacciones(id) on delete cascade,
  producto_id uuid references inventario_productos(id) on delete set null,

  -- SNAPSHOT al momento de venta (NO cambia si el producto cambia después)
  nombre_snapshot text not null,
  codigo_barras_snapshot text,
  categoria_snapshot text,
  costo_unitario_snapshot_mxn numeric(14,2),

  -- Editables al vender
  cantidad numeric(14,2) not null check (cantidad > 0),
  precio_unitario_mxn numeric(14,2) not null check (precio_unitario_mxn >= 0),
  descuento_pct numeric(5,2) default 0 check (descuento_pct >= 0 and descuento_pct <= 100),
  descuento_mxn numeric(14,2) default 0,

  -- Calculados (los maneja la app, no triggers para mantenerlo simple)
  subtotal_mxn numeric(14,2) not null,  -- (precio × cant) - descuento
  ganancia_mxn numeric(14,2),            -- subtotal - (costo × cant), null si sin costo

  created_at timestamptz default now()
);

create index if not exists idx_vi_tx   on venta_items(transaccion_id);
create index if not exists idx_vi_prod on venta_items(producto_id);

alter table venta_items enable row level security;
drop policy if exists "select_autenticado" on venta_items;
drop policy if exists "write_admin" on venta_items;
create policy "select_autenticado" on venta_items for select using (usuario_activo());
create policy "write_admin" on venta_items for all using (usuario_activo()) with check (usuario_activo());

-- Trigger: cuando cambia un venta_item, recalcula totales en transacciones
create or replace function recalc_transaccion_ganancia() returns trigger as $$
declare
  v_tx_id uuid;
begin
  v_tx_id := coalesce(new.transaccion_id, old.transaccion_id);
  update transacciones t
  set
    ganancia_estimada_mxn = sub.ganancia_total,
    costo_total_mxn       = sub.costo_total,
    tiene_items           = (sub.item_count > 0)
  from (
    select
      coalesce(sum(ganancia_mxn), 0)::numeric(14,2) as ganancia_total,
      coalesce(sum(coalesce(costo_unitario_snapshot_mxn, 0) * cantidad), 0)::numeric(14,2) as costo_total,
      count(*) as item_count
    from venta_items
    where transaccion_id = v_tx_id
  ) sub
  where t.id = v_tx_id;
  return null;
end;
$$ language plpgsql;

drop trigger if exists trg_vi_recalc on venta_items;
create trigger trg_vi_recalc
  after insert or update or delete on venta_items
  for each row execute function recalc_transaccion_ganancia();
