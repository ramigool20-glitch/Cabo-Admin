-- =============================================================
-- 0045: Habilitar Realtime para inventario_productos (POS-6)
--
-- Permite que el POS de Tania reciba cambios en vivo cuando admin
-- modifica precio, stock, foto o costo desde su celular.
-- =============================================================

-- Agregar la tabla a la publicación de Realtime
alter publication supabase_realtime add table inventario_productos;
