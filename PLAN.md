# Plan: App de Control de Gastos e Ingresos Multi-Negocio

> Documento maestro de referencia. Incluye plan original + 3 módulos adicionales (Tareas entre socios, Auditor IA proactivo, Gastos fijos con cuenta de pago).

---

## Contexto

Miguel y Sergio son socios en múltiples negocios y necesitan una app para capturar ingresos y gastos rápido desde el celular, dividirlos por negocio, y ver cortes de ganancias con porcentajes configurables por socio/negocio.

**Negocios a trackear (11 centros de costo):**
1. Farmacia (ingreso diario por corte)
2. Consultorio (ingreso diario por corte)
3-10. 8 páginas digitales (cada una con ads + ventas + ROAS independientes)
11. General/Compartido (gastos comunes: rentas, comida, limpieza, etc.)

**Cuentas de cobro a trackear:**
- Mercado Pago Edwin/Miguel (MXN)
- Stripe Mercury (USD)
- Mercado Pago Sergio (MXN)
- Efectivo MXN
- Efectivo USD
- (Extensible desde `/config/cuentas`)

**Zona horaria:** America/Mazatlan (Los Cabos, UTC-7 std / UTC-6 DST).

**Login:** email + password (Supabase Auth).

**Idioma:** español mexicano.

**Monedas:** MXN y USD. Cada transacción guarda su moneda nativa; dashboard muestra totales en ambas + utilidad consolidada (conversión configurable).

---

## Stack Técnico

- **Frontend:** Next.js 14 (App Router) + React + TypeScript + Tailwind CSS + shadcn/ui
- **PWA:** next-pwa (instalable en iOS/Android desde el navegador)
- **Backend + DB + Auth + Realtime + Storage:** Supabase
- **IA:**
  - Anthropic Claude API (claude-sonnet-4-5) con vision para fotos de tickets/cortes
  - OpenAI Whisper API para transcripción de notas de voz
- **Hosting:** Vercel
- **Variables de entorno necesarias:**
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `ANTHROPIC_API_KEY`
  - `OPENAI_API_KEY`
  - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`

---

## Esquema de Base de Datos (Supabase / Postgres)

### Tablas base

```sql
-- Roles y permisos (diseñado para escalar a más colaboradores)
create table roles (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (nombre in ('admin', 'socio', 'colaborador', 'lector')),
  descripcion text,
  permisos jsonb not null default '{}'::jsonb  -- ej. {"transacciones":{"read":true,"write":true},"multas":{"read":true,"write":false}}
);

-- Usuarios (Miguel y Sergio inicialmente, escalable)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  role_id uuid references roles(id),
  -- Negocios a los que tiene acceso (vacío = todos si es admin/socio)
  negocios_acceso uuid[],
  activo boolean default true,
  created_at timestamptz default now()
);

-- Negocios (farmacia, consultorio, página1...página8, general)
create table negocios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo text not null check (tipo in ('farmacia', 'consultorio', 'pagina_digital', 'general')),
  activo boolean default true,
  -- Horario operativo para que el Auditor sepa cuándo recordar
  hora_apertura time,         -- ej. 09:00
  hora_cierre time,           -- ej. 21:00
  dias_operacion int[],       -- 1=lun ... 7=dom (ej. {1,2,3,4,5,6})
  moneda_principal text default 'MXN' check (moneda_principal in ('MXN', 'USD')),
  created_at timestamptz default now()
);

-- Porcentajes de participación por negocio y por socio
create table participaciones (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid references negocios(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  porcentaje numeric(5,2) not null check (porcentaje >= 0 and porcentaje <= 100),
  vigente_desde date not null default current_date,
  vigente_hasta date,
  unique(negocio_id, profile_id, vigente_desde)
);

-- Cuentas de cobro / pago (incluye efectivo)
create table cuentas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,                                  -- "MP Edwin", "Stripe Mercury", "Efectivo MXN"
  titular text,
  tipo text check (tipo in ('mercado_pago', 'stripe', 'efectivo', 'banco', 'tarjeta', 'otra')),
  moneda text not null default 'MXN' check (moneda in ('MXN', 'USD')),
  activo boolean default true,
  notas text
);

-- Tipo de cambio histórico (para consolidar MXN/USD en dashboard)
create table tipos_cambio (
  fecha date primary key,
  usd_a_mxn numeric(10,4) not null,
  origen text default 'manual',
  created_at timestamptz default now()
);

-- Transacciones (ingresos Y gastos Y multas internas Y liquidaciones entre socios)
create table transacciones (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('ingreso', 'gasto', 'multa_interna', 'liquidacion_socio')),
  monto numeric(12,2) not null,
  moneda text not null default 'MXN' check (moneda in ('MXN', 'USD')),
  -- tipo de cambio usado al guardar (para consolidación histórica fiel)
  tipo_cambio_aplicado numeric(10,4),
  fecha date not null default current_date,
  concepto text,
  negocio_id uuid references negocios(id),
  cuenta_id uuid references cuentas(id),
  -- Método de pago real (puede ser distinto del tipo de cuenta)
  metodo_pago text check (metodo_pago in ('stripe', 'mp_terminal', 'mp_transferencia', 'mp_link', 'efectivo_mxn', 'efectivo_usd', 'transferencia_bancaria', 'tarjeta', 'domiciliado', 'otro')),
  categoria text,
  metodo_captura text check (metodo_captura in ('foto', 'voz', 'manual', 'recurrente', 'api', 'auditor', 'multa', 'liquidacion')),
  foto_url text,
  audio_url text,
  raw_ai_response jsonb,
  notas text,
  capturado_por uuid references profiles(id),
  -- Referencia a multa si tipo='multa_interna'
  multa_id uuid,
  created_at timestamptz default now()
);

-- Gastos fijos recurrentes (con cuenta de pago, responsable, etc. — MÓDULO 3)
create table gastos_recurrentes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  monto numeric(12,2) not null,
  negocio_id uuid references negocios(id),
  cuenta_id uuid references cuentas(id),                    -- de QUÉ cuenta se paga
  responsable_id uuid references profiles(id),              -- QUIÉN tiene que pagarlo
  metodo_pago text,                                         -- transferencia, efectivo, domiciliado, tarjeta
  proveedor text,                                           -- a quién se le paga
  referencia_pago text,                                     -- CLABE, número de cuenta, link
  comprobante_requerido boolean default false,
  frecuencia text not null check (frecuencia in ('mensual', 'quincenal', 'semanal', 'anual')),
  dia_del_mes int,
  activo boolean default true,
  proximo_pago date,
  multa_por_no_pago numeric(12,2),                          -- opcional, monto de multa si no se paga a tiempo
  created_at timestamptz default now()
);

-- Pagos hechos a recurrentes (con comprobante)
create table recurrentes_pagados (
  id uuid primary key default gen_random_uuid(),
  recurrente_id uuid references gastos_recurrentes(id) on delete cascade,
  fecha_pago date not null,
  monto_pagado numeric(12,2) not null,
  comprobante_url text,
  pagado_por uuid references profiles(id),
  transaccion_id uuid references transacciones(id),
  notas text,
  created_at timestamptz default now()
);

-- Cortes diarios
create table cortes_diarios (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid references negocios(id),
  fecha date not null,
  venta_total numeric(12,2) not null,
  num_transacciones int,
  efectivo numeric(12,2),
  tarjeta numeric(12,2),
  transferencia numeric(12,2),
  notas text,
  foto_url text,
  raw_ai_response jsonb,
  capturado_por uuid references profiles(id),
  created_at timestamptz default now(),
  unique(negocio_id, fecha)
);

-- Ventas individuales
create table ventas (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid references negocios(id),
  fecha date not null default current_date,
  producto text,
  precio_venta numeric(12,2) not null,
  costo_producto numeric(12,2),
  cuenta_id uuid references cuentas(id),
  notas text,
  capturado_por uuid references profiles(id),
  created_at timestamptz default now()
);

-- Gasto en ads por página y día
create table gastos_ads (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid references negocios(id),
  fecha date not null,
  monto numeric(12,2) not null,
  plataforma text default 'meta',
  metodo_captura text check (metodo_captura in ('foto', 'manual', 'api')),
  foto_url text,
  capturado_por uuid references profiles(id),
  created_at timestamptz default now()
);
```

### Módulo: Nóminas y Empleados

```sql
create table empleados (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  puesto text,
  activo boolean default true,
  fecha_ingreso date,
  notas text,
  created_at timestamptz default now()
);

create table empleado_compensacion (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid references empleados(id) on delete cascade,
  negocio_id uuid references negocios(id),
  sueldo_base numeric(12,2) default 0,
  comision_porcentaje numeric(5,2) default 0,
  comision_base text check (comision_base in ('venta_total', 'utilidad', 'producto_especifico', 'fijo')),
  monto_fijo_comision numeric(12,2),
  frecuencia_pago text not null check (frecuencia_pago in ('mensual', 'quincenal', 'semanal')),
  dia_de_pago int,
  activo boolean default true,
  vigente_desde date default current_date,
  vigente_hasta date,
  created_at timestamptz default now()
);

create table pagos_nomina (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid references empleados(id),
  negocio_id uuid references negocios(id),
  fecha_pago date not null,
  periodo_inicio date,
  periodo_fin date,
  sueldo_base_pagado numeric(12,2) default 0,
  comision_pagada numeric(12,2) default 0,
  ventas_periodo numeric(12,2),
  total numeric(12,2) not null,
  cuenta_id uuid references cuentas(id),
  notas text,
  capturado_por uuid references profiles(id),
  created_at timestamptz default now()
);
```

### Módulo: Notificaciones Push

```sql
create table notificaciones_programadas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('nomina', 'renta', 'recurrente', 'auditor', 'tarea', 'multa', 'custom')),
  titulo text not null,
  mensaje text not null,
  fecha_disparo timestamptz not null,
  destinatarios uuid[] not null,
  enviada boolean default false,
  enviada_at timestamptz,
  ref_tabla text,
  ref_id uuid,
  created_at timestamptz default now()
);

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz default now(),
  unique(endpoint)
);
```

### Módulo: Auditor IA

```sql
create table auditor_conversaciones (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id),
  rol text check (rol in ('user', 'assistant', 'system')),
  contenido text not null,
  tool_calls jsonb,
  created_at timestamptz default now()
);

create table auditor_pendientes (
  id uuid primary key default gen_random_uuid(),
  pregunta text not null,
  contexto text,
  dirigida_a uuid references profiles(id),
  prioridad text check (prioridad in ('alta', 'media', 'baja')),
  estado text default 'abierta' check (estado in ('abierta', 'contestada', 'descartada')),
  respuesta text,
  contestada_at timestamptz,
  created_at timestamptz default now()
);
```

### MÓDULO ADICIONAL 1: Tareas entre socios

```sql
create table tareas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descripcion text,
  creada_por uuid references profiles(id),
  -- Asignación: array para permitir 1 o 2 socios
  asignada_a uuid[] not null,
  fecha_limite timestamptz not null,
  prioridad text not null check (prioridad in ('alta', 'media', 'baja')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_progreso', 'completada', 'vencida')),
  negocio_id uuid references negocios(id),
  categoria text check (categoria in ('operativa', 'administrativa', 'pago', 'corte', 'auditoria', 'otra')),
  recurrente boolean default false,
  frecuencia_recurrente text check (frecuencia_recurrente in ('diaria', 'semanal', 'quincenal', 'mensual')),
  multa_monto numeric(12,2),
  creada_por_auditor boolean default false,
  completada_at timestamptz,
  completada_por uuid references profiles(id),
  created_at timestamptz default now()
);

-- Multas internas con sistema de resolución guiado por la app
create table multas (
  id uuid primary key default gen_random_uuid(),
  tarea_id uuid references tareas(id) on delete cascade,
  responsable_id uuid references profiles(id) not null,
  monto_propuesto numeric(12,2) not null,         -- monto inicial según la tarea
  monto_final numeric(12,2),                      -- monto resuelto (puede ser menor o 0)
  moneda text default 'MXN' check (moneda in ('MXN', 'USD')),
  motivo text not null,
  estado text not null default 'propuesta' check (estado in (
    'propuesta',              -- recién creada, esperando respuesta del responsable
    'aceptada',               -- responsable la aceptó
    'justificada',            -- responsable dio justificación, espera revisión del otro
    'reduccion_solicitada',   -- responsable pide menos monto
    'aprobada',               -- el otro socio aprobó (puede ser tras justificación o reducción)
    'reducida',               -- el otro socio aprobó con monto menor
    'perdonada',              -- el otro socio perdonó toda la multa
    'pendiente_conversacion', -- 48h sin acuerdo, no afecta balance hasta resolver
    'aplicada',               -- pasó a transacción real
    'cancelada'
  )),
  aprobada_por uuid references profiles(id),
  transaccion_id uuid references transacciones(id),
  -- Timer de auto-aceptación: si responsable no responde en 24h, se considera aceptada
  responder_antes_de timestamptz,
  resuelta_at timestamptz,
  created_at timestamptz default now()
);

-- Histórico de movimientos en la negociación de cada multa (auditable)
create table multa_movimientos (
  id uuid primary key default gen_random_uuid(),
  multa_id uuid references multas(id) on delete cascade,
  actor_id uuid references profiles(id) not null,
  accion text not null check (accion in (
    'crear', 'aceptar', 'justificar', 'solicitar_reduccion',
    'aprobar', 'reducir', 'perdonar', 'disputar', 'liquidar', 'cancelar'
  )),
  monto_propuesto numeric(12,2),    -- en caso de solicitud de reducción o ajuste
  mensaje text,                     -- texto de la justificación o respuesta
  created_at timestamptz default now()
);

-- Balance entre socios (vista materializada o calculada en runtime)
-- Se calcula como suma de multas aplicadas - liquidaciones
-- Se expone en /multas como "Miguel debe a Sergio $X" o viceversa
```

---

**RLS (Row Level Security):** habilitar en todas las tablas. Política: solo usuarios autenticados (Miguel y Sergio) pueden leer/escribir.

**Índices:**
```sql
create index idx_transacciones_negocio_fecha on transacciones(negocio_id, fecha desc);
create index idx_cortes_negocio_fecha on cortes_diarios(negocio_id, fecha desc);
create index idx_ventas_negocio_fecha on ventas(negocio_id, fecha desc);
create index idx_gastos_ads_negocio_fecha on gastos_ads(negocio_id, fecha desc);
create index idx_tareas_estado_limite on tareas(estado, fecha_limite);
create index idx_tareas_asignada on tareas using gin(asignada_a);
create index idx_multas_responsable_estado on multas(responsable_id, estado);
```

---

## Estructura de Carpetas

```
/app
  /(auth)
    /login
  /(app)
    /chat              -> captura por foto/voz/texto
    /dashboard         -> resumen global + por negocio
    /negocios          -> listado y detalle
    /negocios/[id]     -> ingresos, gastos, ROAS, ventas, margen
    /transacciones     -> listado/filtros/edición
    /recurrentes       -> gastos fijos (con cuenta, responsable, comprobante)
    /nomina            -> empleados, compensaciones, próximos pagos, historial
    /tareas            -> tareas entre socios (Kanban + lista) [MÓDULO 1]
    /multas            -> balance de multas + disputa [MÓDULO 1]
    /auditor           -> chat con Auditor IA + pendientes
    /config            -> negocios, cuentas, % participación, notificaciones
  /api
    /ai/parse-ticket
    /ai/parse-voice
    /ai/chat
    /ai/auditor
    /push/subscribe
    /push/send
    /cron/recurrentes
    /cron/notificaciones
    /cron/auditor                  -> Auditor IA diario + proactivo [MÓDULO 2]
    /cron/auditor-recordatorios    -> recordatorios horarios proactivos [MÓDULO 2]
    /cron/comisiones
    /cron/tareas-vencimiento       -> revisa tareas vencidas → genera multas [MÓDULO 1]
/components
  /chat
  /dashboard
  /forms
  /auditor
  /tareas
  /multas
  /ui                  -> shadcn
/lib
  /supabase
  /ai
  /push
  /utils
/types
/public
  /icons
manifest.json
sw.js
```

---

## Flujos clave

### 1. Captura por FOTO (ticket o corte)
1. Usuario abre `/chat`, toca cámara, toma foto.
2. Foto se sube a Supabase Storage.
3. POST a `/api/ai/parse-ticket` con la URL.
4. Claude (sonnet-4-5) con vision extrae JSON.
5. Burbuja de confirmación con negocio/cuenta/categoría sugeridos.
6. Se guarda en `transacciones` (o `cortes_diarios` si es corte).
7. Realtime sincroniza con el otro socio.

### 2. Captura por VOZ
1. Hold del micrófono, dictado.
2. Audio → Storage → Whisper → Claude → JSON estructurado → confirmación.

### 3. Captura por TEXTO
- Claude interpreta texto del chat como gasto/ingreso o pregunta.

### 4. Corte diario de farmacia/consultorio
- Foto → IA extrae venta total + métodos de pago → `cortes_diarios`.

### 5. Gastos de ads
- Screenshot del Ads Manager → IA extrae → `gastos_ads`. O manual.

### 6. Gastos recurrentes (MÓDULO 3 expandido)
- En `/recurrentes` se dan de alta: nombre, monto, frecuencia, **cuenta de pago, responsable, método de pago, proveedor, referencia, comprobante requerido sí/no, multa por no pago**.
- Cron diario (`/api/cron/recurrentes` a las 06:00) revisa qué vence hoy.
- Al vencer, espera al socio responsable.
- **Si pasa 1 día sin marcar pagado → crea tarea automática con multa**.
- Lista en `/recurrentes` muestra: nombre, monto, día, cuenta, responsable, próxima fecha. Botón "marcar como pagado" abre form para subir comprobante.

### 7. Dashboard
- Vista global, por negocio, ROAS, costo por venta, margen real, filtros.

### 8. Corte de ganancias por socio
- `/config/participaciones`, cálculo listo, % se llenan después.

### 9. Tareas entre socios (MÓDULO 1)
- En `/tareas` cualquier socio puede crear y asignar al otro o a ambos.
- Filtros: mías, asignadas por mí, todas, vencidas, por negocio.
- Vista lista + Kanban opcional.
- Botón "completar" con timestamp.
- **Notificaciones push automáticas:**
  - Al asignar → push al destinatario.
  - 24h antes del vencimiento → push de recordatorio.
  - 2h antes → push de urgencia.
  - Al vencer sin completar → push a AMBOS socios.

### 10. Multas internas (MÓDULO 1) — Sistema de resolución guiada

**Filosofía:** la app guía la conversación para que ningún conflicto quede en el aire. Toda decisión queda registrada y auditable. Las multas SÍ son dinero real y se reflejan en utilidad consolidada.

**Flujo al vencer una tarea con multa:**

1. Tarea → `estado='vencida'`. Se crea `multas` con `estado='propuesta'`, `responder_antes_de = now() + 24h`.
2. Push al responsable: *"Vencida la tarea [X]. Multa propuesta: $Y. Tienes 24h para responder."*
3. El responsable tiene 4 opciones en la app:
   - **Aceptar** → `estado='aceptada'`, pasa a aplicada en 0h.
   - **Justificar** (con texto + foto opcional) → `estado='justificada'`. Push al otro socio para revisar.
   - **Pedir reducción** (proponer nuevo monto + motivo) → `estado='reduccion_solicitada'`.
   - **Marcar tarea como completada tarde** (con evidencia) → el otro socio valida.
4. Si pasa 24h sin respuesta → auto `estado='aceptada'`.

**Decisiones del otro socio (al recibir justificación o reducción):**
- **Aprobar** → `estado='aprobada'` con monto original → aplicada.
- **Reducir** → `estado='reducida'` con nuevo monto → aplicada.
- **Perdonar** → `estado='perdonada'`, monto_final = 0.
- **Disputar** → otro push de vuelta al responsable con respuesta.

**Si pasan 48h sin acuerdo final** → `estado='pendiente_conversacion'`. NO afecta balance. Push semanal recordando hasta resolver.

**Una vez `aprobada/reducida/aceptada`** → se crea automáticamente:
- Transacción `tipo='multa_interna'` con `monto=monto_final`, asignada al responsable.
- Se actualiza `multa.transaccion_id` y `estado='aplicada'`.

**Pantalla `/multas`:**
- **Tab "Activas":** multas en curso con su estado y acción pendiente de cada socio.
- **Tab "Balance":** "Miguel debe a Sergio $X MXN + $Y USD" (o viceversa).
- **Tab "Histórico":** todas las multas con su resolución y movimientos.
- **Botón "Liquidar":** genera transacción `tipo='liquidacion_socio'` que cancela el balance (se registra como gasto/ingreso real en la cuenta seleccionada).

Cada movimiento se guarda en `multa_movimientos` para trazabilidad total.

### 12. Multi-moneda y tipo de cambio
- Cada transacción guarda su moneda nativa (MXN o USD) y `tipo_cambio_aplicado` al momento.
- Tabla `tipos_cambio` se actualiza con cron diario (puede ser manual o vía API gratuita tipo exchangerate.host).
- Dashboard muestra: totales en MXN nativos, totales en USD nativos, y total consolidado en MXN.
- Cuentas tienen `moneda` propia. Si se hace una transacción en USD desde una cuenta MXN (raro pero posible), se requiere especificar tipo de cambio.

### 11. Auditor IA Proactivo (MÓDULO 2)
- Cron diario (10:00 AM) ya descrito.
- **NUEVO: cron horario `/api/cron/auditor-recordatorios`:**
  - **21:00:** si no hay `cortes_diarios` para farmacia con `fecha=hoy` → push "¿Ya subiste el corte de la farmacia?".
  - **21:30:** lo mismo para consultorio.
  - **22:00:** por cada página digital, si hay `gastos_ads` hoy pero `ventas=0` → push "Página X gastó $Y en ads y no registró ventas. ¿Se te pasó capturar o realmente no hubo?".
  - **08:00:** resumen del día anterior con anomalías ("Ayer farmacia vendió 30% menos que el promedio, ¿qué pasó?").
- **Auditor crea tareas automáticamente:**
  - Corte no subido 2 días seguidos → tarea al responsable con multa.
  - Nómina por vencer sin saldo proyectado en cuenta → tarea "transferir fondos".
  - Gasto sin clasificar >24h → tarea "clasificar transacción".
- Las tareas creadas por el Auditor llevan `creada_por_auditor=true`.

---

## Prompts de IA

### Prompt extracción de TICKET (gasto)
[Ver versión completa en el plan original — sin cambios]

### Prompt extracción de NOTA DE VOZ
[Ver versión completa en el plan original — sin cambios]

### Prompt CHAT conversacional
[Ver versión completa en el plan original — sin cambios]

### Prompt Auditor (cron diario)
Eres el Auditor IA. Revisa los últimos 7 días y detecta:
1. Gastos atípicos (>2× promedio).
2. Negocios sin actividad esperada.
3. Empleados sin compensación bien definida.
4. Recurrentes próximos a vencer.
5. Transacciones sin negocio/categoría.
6. Huecos (gastos típicos faltantes).

Para cada hallazgo: (a) crear pendiente, (b) registrar observación, o (c) push inmediato.

### Prompt Auditor (recordatorios proactivos) [MÓDULO 2]
Eres el Auditor IA proactivo. Tu trabajo es asegurar que la operación diaria quede capturada. Genera mensajes push cortos y directos según las reglas horarias.

### Prompt Auditor (chat conversacional)
[Ver versión completa en el plan original — sin cambios]

---

## Tools del Auditor

```
- consultar_transacciones(filtros)
- consultar_promedio_gasto(negocio_id, categoria, rango)
- detectar_anomalias(negocio_id?, rango)
- listar_recurrentes_proximos(dias)
- listar_empleados()
- crear_gasto_recurrente(...)
- crear_empleado(...)
- actualizar_empleado_compensacion(...)
- crear_pendiente(pregunta, dirigida_a, prioridad)
- marcar_pendiente_contestado(id, respuesta)
- programar_notificacion(...)
- crear_tarea(...)                          [MÓDULO 2]
- crear_multa(tarea_id, responsable, monto) [MÓDULO 1+2]
```

---

## Funcionalidades incluidas en el MVP completo

- [x] Auth con Supabase
- [x] PWA instalable iOS/Android
- [x] Chat con cámara/micrófono/texto
- [x] Captura por foto con IA
- [x] Captura por voz con IA
- [x] Captura manual
- [x] Asignación de negocio + cuenta
- [x] Cortes diarios
- [x] Ventas individuales
- [x] Gastos de ads
- [x] Gastos recurrentes con cuenta/responsable/comprobante [MÓDULO 3]
- [x] Dashboard global y por negocio
- [x] ROAS y costo por venta
- [x] Realtime entre celulares
- [x] Estructura para % por socio
- [x] Historial editable
- [x] Empleados con sueldo + comisiones
- [x] Cálculo automático de comisiones
- [x] Push: nómina, renta, recurrentes
- [x] Auditor IA diario
- [x] Chat con Auditor IA
- [x] Pendientes por socio
- [x] **Tareas entre socios con asignación, prioridad, multas** [MÓDULO 1]
- [x] **Multas con disputa/aprobación + balance entre socios** [MÓDULO 1]
- [x] **Auditor IA proactivo con recordatorios horarios** [MÓDULO 2]
- [x] **Auditor IA crea tareas automáticas** [MÓDULO 2]

---

## Fase 2 (NO incluir en MVP)
- Meta Ads API
- Mercado Pago / Stripe APIs
- Notificaciones de gastos fuera de rango
- Exportación a Excel/PDF
- Predicciones de flujo de caja
- App nativa React Native

---

## Crons de Vercel

Zona horaria operativa: **America/Mazatlan (Los Cabos, UTC-7)**.
Vercel cron usa UTC. Conversión: hora_local_Cabos + 7 = UTC.

```json
{
  "crons": [
    { "path": "/api/cron/recurrentes",            "schedule": "0 13 * * *" },
    { "path": "/api/cron/notificaciones",         "schedule": "0 * * * *" },
    { "path": "/api/cron/auditor",                "schedule": "0 17 * * *" },
    { "path": "/api/cron/auditor-recordatorios",  "schedule": "0 * * * *" },
    { "path": "/api/cron/comisiones",             "schedule": "0 14 * * *" },
    { "path": "/api/cron/tareas-vencimiento",     "schedule": "*/30 * * * *" },
    { "path": "/api/cron/tipo-cambio",            "schedule": "0 15 * * *" }
  ]
}
```
- 13 UTC = 06:00 Cabos → recurrentes
- 17 UTC = 10:00 Cabos → auditor diario
- 14 UTC = 07:00 Cabos → comisiones
- 15 UTC = 08:00 Cabos → tipo de cambio

El cron horario `auditor-recordatorios` corre todas las horas y dentro decide si toca disparar (lee `negocio_horarios` para saber qué negocio cerró).

---

## Plan de ejecución por fases

> Cada fase deja algo USABLE en el celular antes de pasar a la siguiente.

### **FASE 0 — Setup (1 sesión)**
- Crear cuentas: Supabase, Vercel, Anthropic, OpenAI.
- Generar API keys.
- Repo + Next.js inicial + Tailwind + shadcn.
- Schema base SQL en Supabase.
- Deploy "hola mundo" a Vercel.
- **Entregable:** URL en Vercel que se puede abrir desde el celular.

### **FASE 1 — Auth + PWA + esqueleto (1 sesión)**
- Login con email/password en Supabase.
- Sembrar perfiles de Miguel y Sergio.
- PWA instalable (manifest + service worker + iconos).
- Navegación base con menú móvil.
- **Entregable:** Miguel y Sergio se loguean y agregan la app a su pantalla de inicio.

### **FASE 2 — Captura manual + listado (1-2 sesiones)**
- Sembrar los 11 negocios + 3 cuentas.
- Form manual rápido para crear transacciones (ingreso/gasto + negocio + cuenta + monto).
- Pantalla `/transacciones` con lista filtrable.
- Realtime entre los dos celulares.
- **Entregable:** Ya pueden capturar gastos a mano desde el celular y ven los del socio en tiempo real.

### **FASE 3 — Captura con IA (foto + voz) (2 sesiones)**
- Endpoint `/api/ai/parse-ticket` (Claude vision).
- Endpoint `/api/ai/parse-voice` (Whisper + Claude).
- Chat principal con botón cámara + micrófono.
- Burbuja de confirmación antes de guardar.
- Cortes diarios de farmacia/consultorio por foto.
- **Entregable:** Foto de un ticket o nota de voz genera transacción.

### **FASE 4 — Dashboard + ROAS (1-2 sesiones)**
- Pantalla `/dashboard` con totales globales y por negocio.
- Cálculo de ROAS, costo por venta, margen.
- Gráficas con recharts.
- **Entregable:** Tablero con números reales del mes.

### **FASE 5 — Gastos recurrentes + Empleados + Cron (1-2 sesiones)**
- Pantalla `/recurrentes` con todos los campos del Módulo 3 (cuenta, responsable, comprobante, etc.).
- Pantalla `/nomina` con empleados y compensaciones.
- Cron diario para generar transacciones recurrentes.
- Cron para cálculo de comisiones.
- **Entregable:** Las rentas y sueldos se generan solos cada mes.

### **FASE 6 — Notificaciones push (1 sesión)**
- VAPID keys + service worker push.
- Registro del dispositivo al loguearse.
- Cron horario para disparar notificaciones programadas.
- Recordatorios push de nómina (1 día antes) y renta (2 días antes).
- **Entregable:** Llegan push al celular.

### **FASE 7 — Tareas entre socios + Multas (2 sesiones) [MÓDULO 1]**
- Pantalla `/tareas` con lista + filtros + Kanban.
- Crear/asignar tareas con prioridad, fecha, negocio, multa.
- Push al asignar, 24h, 2h, vencimiento.
- Cron `/api/cron/tareas-vencimiento` cada 30 min para marcar vencidas.
- Sistema de multas con disputa/aprobación.
- Pantalla `/multas` con balance entre socios.
- **Entregable:** Se asignan tareas con multa real al socio que no cumple.

### **FASE 8 — Auditor IA básico (1-2 sesiones)**
- Pantalla `/auditor` con chat conversacional.
- Cron diario que analiza últimos 7 días.
- `auditor_pendientes` con preguntas por prioridad.
- Tools básicos (consultar_*, crear_gasto_recurrente, crear_empleado).
- **Entregable:** El Auditor pregunta cosas útiles y llena la base sola.

### **FASE 9 — Auditor IA proactivo (1 sesión) [MÓDULO 2]**
- Cron horario `/api/cron/auditor-recordatorios`.
- Reglas: 21:00 farmacia, 21:30 consultorio, 22:00 páginas digitales, 08:00 resumen.
- Auditor crea tareas automáticas con multa cuando detecta huecos.
- **Entregable:** El Auditor empuja la operación diaria sin que tú lo pidas.

### **FASE 10 — Pulido + Onboarding (1 sesión)**
- Sembrado inicial de gastos típicos (luz, agua, internet, etc.).
- Onboarding rápido en el primer login.
- Ajustes finales de UX móvil.
- **Entregable:** App lista para usar todos los días.

---

## Checklist de validación final

Ver checklist completo en el plan original + estos extras:

- [ ] Miguel asigna una tarea a Sergio con fecha límite y llega push a Sergio.
- [ ] Si una tarea con multa vence, se crea automáticamente una propuesta de multa.
- [ ] Sergio puede aprobar o disputar una multa propuesta por Miguel.
- [ ] El balance de multas entre socios se ve en `/multas`.
- [ ] A las 21:00 llega push si no se subió el corte de la farmacia.
- [ ] A las 22:00 llega push si una página gastó en ads pero no tiene ventas registradas.
- [ ] Cuando una renta vence sin marcarse como pagada, se crea una tarea automática.
- [ ] Cada gasto recurrente muestra: cuenta de pago, responsable, próxima fecha.
- [ ] Al marcar un recurrente como pagado se puede subir foto del comprobante.
