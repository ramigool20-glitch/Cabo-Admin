-- =============================================================
-- Migración 0025: Módulo Cabo Walk-in Clinic
-- =============================================================
-- Catálogo de servicios (bilingüe), registro de servicios realizados
-- por la enfermera, y tabulador de comisiones.
-- =============================================================

-- 1) CATÁLOGO de servicios
create table if not exists clinica_servicios (
  id uuid primary key default gen_random_uuid(),
  categoria text not null check (categoria in ('consulta', 'iv', 'lab', 'inyeccion', 'enfermeria', 'otro')),
  nombre_es text not null,
  nombre_en text,
  precio_cliente numeric(12,2),
  moneda_precio text default 'USD' check (moneda_precio in ('USD', 'MXN')),
  comision_enfermera numeric(12,2),      -- cuánto gana la enfermera por este servicio (MXN)
  moneda_comision text default 'MXN',
  ingredientes text,                     -- qué lleva (IV)
  para_que_sirve text,                   -- descripción / utilidad
  protocolo text,                        -- cómo se administra
  activo boolean default true,
  orden int default 0,
  created_at timestamptz default now()
);
create index if not exists idx_clinica_serv_cat on clinica_servicios(categoria);
create index if not exists idx_clinica_serv_activo on clinica_servicios(activo);

alter table clinica_servicios enable row level security;
drop policy if exists "select_autenticado" on clinica_servicios;
drop policy if exists "write_admin" on clinica_servicios;
create policy "select_autenticado" on clinica_servicios for select using (usuario_activo());
create policy "write_admin" on clinica_servicios for all using (usuario_activo()) with check (usuario_activo());

-- 2) SERVICIOS REALIZADOS (la enfermera captura)
create table if not exists clinica_realizados (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid references clinica_servicios(id),
  servicio_nombre text,                  -- snapshot por si cambia el catálogo
  enfermera_id uuid references profiles(id),
  fecha date not null default current_date,
  ubicacion text,                        -- clinica, mobile, katherine, san_jose, pedregal, etc.
  pago_comision numeric(12,2) default 0, -- comisión de la enfermera (MXN)
  propina numeric(12,2) default 0,
  moneda text default 'MXN',
  cobrado_cliente numeric(12,2),         -- lo que pagó el cliente (opcional)
  notas text,
  transaccion_id uuid references transacciones(id) on delete set null,  -- si genera ingreso al negocio
  created_at timestamptz default now()
);
create index if not exists idx_clinica_real_fecha on clinica_realizados(fecha desc);
create index if not exists idx_clinica_real_enf on clinica_realizados(enfermera_id);

alter table clinica_realizados enable row level security;
drop policy if exists "select_autenticado" on clinica_realizados;
drop policy if exists "write_admin" on clinica_realizados;
create policy "select_autenticado" on clinica_realizados for select using (usuario_activo());
create policy "write_admin" on clinica_realizados for all using (usuario_activo()) with check (usuario_activo());

-- 3) CONFIG de comisiones / bonos por enfermera
create table if not exists clinica_config_enfermera (
  id uuid primary key default gen_random_uuid(),
  enfermera_id uuid references profiles(id),
  nombre text not null,
  sueldo_base_quincenal numeric(12,2) default 0,
  bono_por_review numeric(12,2) default 50,    -- $ por cada review
  reviews_acumuladas int default 0,
  notas text,
  activa boolean default true,
  created_at timestamptz default now()
);
alter table clinica_config_enfermera enable row level security;
drop policy if exists "select_autenticado" on clinica_config_enfermera;
drop policy if exists "write_admin" on clinica_config_enfermera;
create policy "select_autenticado" on clinica_config_enfermera for select using (usuario_activo());
create policy "write_admin" on clinica_config_enfermera for all using (usuario_activo()) with check (usuario_activo());

-- 4) CATÁLOGO PRECARGADO (de cabowalkinclinic.com)
insert into clinica_servicios (categoria, nombre_es, nombre_en, precio_cliente, moneda_precio, comision_enfermera, ingredientes, para_que_sirve, orden) values
  -- Consultas
  ('consulta', 'Consulta en clínica (urgencias)', 'Walk-In Clinic Visit', 80, 'USD', null, null, 'Atención médica con doctor que habla inglés, curaciones y suturas. 9am-10pm.', 1),
  ('consulta', 'Visita a domicilio', 'Mobile House Call', 200, 'USD', null, null, 'Evaluación completa en hotel/villa/yate, tratamiento en sitio, entrega de medicamento. 24/7.', 2),
  -- IV Therapy
  ('iv', 'Hidratación', 'Hydration Drip', 149, 'USD', 250, 'Suero, electrolitos, complejo B', 'Rehidratación general, energía.', 10),
  ('iv', 'Cruda (resaca)', 'Hangover Drip', 169, 'USD', 250, 'Líquidos IV, antináusea, complejo B, vitamina C alta dosis', 'Recuperación de cruda/resaca.', 11),
  ('iv', 'Refuerzo inmune', 'Immune Boost', 159, 'USD', 250, 'Vitamina C alta dosis, zinc, complejo B', 'Refuerzo del sistema inmune.', 12),
  ('iv', 'Post-vuelo / Jet Lag', 'Post-Flight / Jet Lag', 159, 'USD', 250, 'Hidratación, B12, magnesio', 'Recuperación de viajes largos.', 13),
  ('iv', 'Belleza / Glow', 'Beauty / Glow', 189, 'USD', 250, 'Glutatión, biotina, vitamina C', 'Piel, cabello, antioxidante.', 14),
  ('iv', 'Recuperación atlética', 'Athletic Recovery', 199, 'USD', 250, 'Aminoácidos, electrolitos, complejo B', 'Recuperación muscular y deportiva.', 15),
  ('iv', 'NAD+ (Premium)', 'NAD+ Drip', 189, 'USD', 300, 'NAD+', 'Energía celular y soporte cognitivo.', 16),
  ('iv', 'Personalizada', 'Custom Drip', null, 'USD', 250, 'Mezcla diseñada por el equipo médico', 'A la medida del paciente.', 17),
  -- Laboratorios (paneles)
  ('lab', 'Panel de Bienestar de Viaje', 'Travel Wellness Panel', 249, 'USD', 80, null, 'BH completa, química 14, perfil de lípidos, vitamina D, examen de orina.', 30),
  ('lab', 'Lab Cruda y Recuperación', 'Hangover & Recovery Lab', 179, 'USD', 80, null, 'Química, lípidos, función hepática (ALT/AST/GGT/bilirrubina), vitamina D, magnesio.', 31),
  ('lab', 'Panel Ejecutivo de Salud', 'Executive Health Panel', 549, 'USD', 80, null, 'BH con diferencial, química 14, lípidos+ApoB, HbA1c, vit D, B12, magnesio, hierro+ferritina, tiroides completa, testosterona/estradiol, cortisol, PCR, orina.', 32),
  ('lab', 'Chequeo Hormonal (Hombres)', 'Hormone Check (Men)', 329, 'USD', 80, null, 'Testosterona total+libre, LH, FSH, SHBG, DHEA-S, PSA.', 33),
  ('lab', 'Chequeo Hormonal (Mujeres)', 'Hormone Check (Women)', 329, 'USD', 80, null, 'Estradiol, progesterona, LH, FSH, SHBG, DHEA-S, tiroides, cortisol.', 34),
  ('lab', 'Panel ETS Estándar', 'STI/STD Standard', 249, 'USD', 80, null, 'Clamidia, gonorrea, sífilis, VIH 1 y 2.', 35),
  ('lab', 'Panel ETS Ampliado', 'STI/STD Expanded', 369, 'USD', 80, null, 'Estándar + tricomonas, hepatitis B/C, herpes HSV-2.', 36),
  ('lab', 'Apto para Volar / Pre-viaje', 'Fit-to-Fly / Pre-Travel', 229, 'USD', 80, null, 'BH, química, lípidos, glucosa, orina. COVID/influenza opcional +$89.', 37),
  ('lab', 'Vitamina D', 'Vitamin D', 99, 'USD', 80, null, 'Mide nivel de vitamina D (25-OH).', 38),
  ('lab', 'Testosterona', 'Testosterone', 99, 'USD', 80, null, 'Nivel de testosterona.', 39),
  ('lab', 'Hemoglobina glucosilada', 'HbA1c', 79, 'USD', 80, null, 'Control de diabetes (promedio glucosa 3 meses).', 40),
  ('lab', 'Tiroides (TSH)', 'Thyroid TSH', 79, 'USD', 80, null, 'Función tiroidea.', 41),
  ('lab', 'Antígeno prostático (PSA)', 'PSA', 89, 'USD', 80, null, 'Tamizaje de próstata.', 42),
  ('lab', 'Prueba de embarazo (hCG)', 'Pregnancy hCG', 89, 'USD', 80, null, 'Detección de embarazo.', 43),
  ('lab', 'Proteína C reactiva (PCR)', 'CRP', 79, 'USD', 80, null, 'Marcador de inflamación.', 44),
  ('lab', 'Hierro + Ferritina', 'Iron + Ferritin', 99, 'USD', 80, null, 'Anemia y reservas de hierro.', 45),
  -- Inyecciones / enfermería
  ('inyeccion', 'Inyección de antibiótico', 'Antibiotic Injection', null, 'MXN', 90, null, 'Aplicación de antibiótico intramuscular.', 50),
  ('inyeccion', 'Inyección genérica', 'Generic Injection', null, 'MXN', 90, null, 'Aplicación de medicamento inyectado.', 51),
  ('enfermeria', 'Curación / cuidado de herida', 'Wound Care', null, 'MXN', 150, null, 'Curaciones post-cirugía, cuidado de heridas.', 60),
  ('lab', 'Laboratorio en clínica', 'In-Clinic Lab Draw', null, 'MXN', 80, null, 'Toma de muestra en la clínica.', 29)
on conflict do nothing;
