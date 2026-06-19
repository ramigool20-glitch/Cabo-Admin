-- =============================================================
-- 0047: Huellas dactilares para checador (WebAuthn / FIDO)
-- =============================================================

create table if not exists huellas_dactilares (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  profile_nombre text,
  credential_id text not null unique,        -- ID del credential FIDO (base64url)
  public_key text not null,                  -- llave pública (base64url)
  device_info text,                          -- "Kensington VeriMark Guard", "Touch ID", etc.
  registrado_por uuid references profiles(id),
  activo boolean default true,
  ultimo_uso timestamptz,
  usos_count int default 0,
  created_at timestamptz default now()
);

create index if not exists idx_huella_prof on huellas_dactilares(profile_id) where activo = true;
create index if not exists idx_huella_cred on huellas_dactilares(credential_id) where activo = true;

alter table huellas_dactilares enable row level security;
drop policy if exists "select_autenticado" on huellas_dactilares;
drop policy if exists "write_admin" on huellas_dactilares;
create policy "select_autenticado" on huellas_dactilares for select using (usuario_activo());
create policy "write_admin" on huellas_dactilares for all using (usuario_activo()) with check (usuario_activo());
