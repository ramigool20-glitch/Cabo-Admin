-- =============================================================
-- Migración 0002: Habilitar Supabase Realtime para sincronización
-- entre los dispositivos de Miguel y Sergio.
-- =============================================================

-- Realtime requiere REPLICA IDENTITY FULL para emitir el row completo
-- en eventos UPDATE y DELETE.

alter table transacciones replica identity full;
alter table tareas        replica identity full;
alter table multas        replica identity full;

-- Agregamos las tablas a la publicación de Realtime.
alter publication supabase_realtime add table transacciones;
alter publication supabase_realtime add table tareas;
alter publication supabase_realtime add table multas;
