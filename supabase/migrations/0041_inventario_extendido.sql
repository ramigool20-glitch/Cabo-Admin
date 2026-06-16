-- =============================================================
-- 0041: Inventario extendido — campos del modelo de Pulpos
--
-- Todo additive: no se borra ni renombra nada. La app existente sigue
-- funcionando idéntica; los nuevos campos son opcionales con default
-- razonable.
--
-- Categorías que se agregan:
--   • Identificación: sku, marca, clave_sat
--   • Físico: ubicacion (estante), descripcion
--   • Económico: costo_mxn, cobra_iva
--   • Farmacia: requiere_receta, lote, fecha_caducidad
--   • POS / catálogo: vende_pos
-- =============================================================

alter table inventario_productos
  add column if not exists sku text,
  add column if not exists marca text,
  add column if not exists clave_sat text,
  add column if not exists ubicacion text,
  add column if not exists descripcion text,
  add column if not exists costo_mxn numeric(14,2),
  add column if not exists cobra_iva boolean default true,
  add column if not exists requiere_receta boolean default false,
  add column if not exists lote text,
  add column if not exists fecha_caducidad date,
  add column if not exists vende_pos boolean default true;

-- Índices útiles para los reportes que van a usar estos campos
create index if not exists idx_inv_caducidad
  on inventario_productos(fecha_caducidad)
  where fecha_caducidad is not null and activo = true;

create index if not exists idx_inv_rx
  on inventario_productos(requiere_receta)
  where requiere_receta = true and activo = true;

create index if not exists idx_inv_marca
  on inventario_productos(marca)
  where marca is not null;

create index if not exists idx_inv_sku
  on inventario_productos(sku)
  where sku is not null;
