-- =============================================================
-- 0050: Eventos de voz detectados en el POS
-- Web Speech API detecta keywords y guarda transcripción + análisis IA
-- =============================================================

create table if not exists voice_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete set null,
  profile_nombre text,
  negocio_id uuid references negocios(id) on delete set null,

  -- Detección
  keyword text not null,                   -- "precio", "cancelar", "devolver", etc.
  categoria text not null check (categoria in ('precio', 'cancelacion', 'devolucion', 'problema', 'fiado', 'general')),
  transcript text not null,                -- texto crudo capturado por el browser
  duracion_seg int,                        -- cuántos segundos de conversación
  confidence numeric,                      -- 0-1 confianza del reconocedor del browser

  -- Análisis IA Claude
  analisis_resumen text,                   -- resumen 1-2 líneas
  analisis_tono text,                      -- 'normal' | 'tenso' | 'queja' | 'positivo'
  analisis_accion text,                    -- recomendación: 'nada' | 'revisar' | 'urgente'
  analisis_at timestamptz,

  notificado_push boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_voice_recent on voice_events(created_at desc);
create index if not exists idx_voice_categoria on voice_events(categoria, created_at desc);

alter table voice_events enable row level security;
drop policy if exists "select_autenticado" on voice_events;
drop policy if exists "write_admin" on voice_events;
create policy "select_autenticado" on voice_events for select using (usuario_activo());
create policy "write_admin" on voice_events for all using (usuario_activo()) with check (usuario_activo());

notify pgrst, 'reload schema';
