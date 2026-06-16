-- =============================================================
-- Migración 0040: Foto opcional en productos del inventario
-- =============================================================
-- Cada producto puede tener una foto (path al bucket 'productos').
-- La foto se sirve via signed URL con TTL corto.

alter table inventario_productos
  add column if not exists foto_url text;

create index if not exists idx_inv_foto on inventario_productos(foto_url) where foto_url is not null;
