# GUIA.md — Proyecto de práctica: Inventario por eventos

> **Para el agente que lea este archivo:** tu rol es ser **tutor**, no ejecutor.
> Guía al usuario fase por fase para que construya un monorepo con frontend,
> infraestructura y dos microservicios (TypeScript y Python) que se comunican por
> eventos en AWS usando SST. Lee la sección "Reglas para el agente" antes de empezar.

---

## 0. Contexto del usuario

- El usuario forma parte del proyecto **adogtame** (organización `Magdala-Commitee-Corporation`), que usa:
  polyrepo, SST v4 sobre AWS, Lambdas sin framework, SNS + SQS con filtros por atributo `tipo`,
  DLQ, patrón Outbox, SSM Parameter Store para conectar repos, `sst.Secret`, React + Vite.
- Quiere **practicar esos conceptos** en un proyecto pequeño e independiente.
- Tiene una base conceptual (ya recibió una guía de conceptos), pero **está aprendiendo**.
- Idioma: **español**. TypeScript es referencia, no el foco: lo importante son los conceptos.

## 1. Reglas para el agente (tutor)

1. **Una fase a la vez.** No avances a la siguiente sin que el usuario cumpla los criterios de aceptación.
2. **El usuario escribe el código.** Tú explicas, das esqueletos parciales, revisas y corriges.
   Solo da código completo si el usuario lo pide explícitamente o lleva tiempo bloqueado.
3. **Antes de cada fase:** explica en 3–5 líneas el concepto y *por qué* existe.
   **Después de cada fase:** haz 1–2 preguntas de comprobación (ver "Preguntas de control").
4. **Verifica la documentación actual** de SST, AWS y librerías antes de afirmar sintaxis exacta:
   las APIs cambian. Si dudas, búscalo; no inventes opciones de configuración.
5. **Cuida el costo.** Todo debe caber en la capa gratuita: DynamoDB *on-demand*, sin WAF,
   sin NAT, sin RDS. Recuerda al usuario hacer `sst remove` de stages que ya no use.
6. **Nunca** pidas ni escribas credenciales en archivos. Usa perfiles de AWS y `sst secret`.
7. Cuando el usuario cometa un error típico (ver sección 9), **dale una pista antes que la solución**.
8. Mantén un registro de progreso en `PROGRESO.md` en la raíz del monorepo (fase actual, decisiones, dudas).

---

## 2. El dominio

**Registro de entradas y salidas de productos, con actualización de inventario.**

- Un **movimiento** es una entrada (llega mercadería) o una salida (se despacha).
- El **inventario** guarda el stock actual de cada producto (`sku`).
- Cuando se registra un movimiento, el inventario se actualiza **de forma asíncrona**.
- Una salida que deje el stock en negativo se **rechaza**, y el servicio de movimientos se entera por un evento.

### Servicios

| Pieza | Lenguaje | Responsabilidad | Dueño de los datos |
|---|---|---|---|
| `infra` | TS (SST) | Temas SNS, parámetros SSM, (opcional) Router/CloudFront | — |
| `movimientos` | **TypeScript** | API para registrar/listar movimientos; publica `MovimientoRegistrado` | Tabla `Movimientos` |
| `inventario` | **Python** | Consume movimientos, actualiza stock, API de consulta; publica `StockInsuficiente` y `StockBajo` | Tabla `Inventario` + `EventosProcesados` |
| `web` | TS (React + Vite) | Formulario de movimientos, tabla de stock, lista de movimientos | — |

### Flujo principal

```
[web] --POST /movimientos--> [movimientos TS] --guarda--> DynamoDB Movimientos (estado: PENDIENTE)
                                    |
                                    └─publica "MovimientoRegistrado"─► SNS MovimientosEvents
                                                                           │ (filtro tipo)
                                                                           ▼
                                                                   SQS inventario ─► [inventario PY]
                                                                                        │
                                          ┌── actualiza stock (idempotente) ◄───────────┘
                                          │
              si salida sin stock ──► publica "StockInsuficiente" ─► SNS InventarioEvents
                                                                           ▼
                                                    SQS movimientos ─► [movimientos TS] marca RECHAZADO
              si todo ok ─────────► publica "MovimientoAplicado" ─────► (movimientos marca APLICADO)
```

Esto enseña: pub/sub, fan-out, filtros, colas por consumidor, DLQ, idempotencia,
**consistencia eventual** y una **saga mínima** (compensación por evento).

---

## 3. Contrato de eventos

Todos los mensajes van a SNS con:

- **Atributo de mensaje** `tipo` (String) → usado por los filtros de suscripción.
- **Cuerpo JSON** con un sobre común:

```json
{
  "id": "uuid-del-evento",
  "tipo": "MovimientoRegistrado",
  "version": 1,
  "ocurridoEn": "2026-11-24T15:00:00Z",
  "datos": { }
}
```

| Evento | Publica | Consume | `datos` |
|---|---|---|---|
| `MovimientoRegistrado` | movimientos | inventario | `movimientoId, sku, tipoMovimiento ("ENTRADA"\|"SALIDA"), cantidad` |
| `MovimientoAplicado` | inventario | movimientos | `movimientoId, sku, stockResultante` |
| `StockInsuficiente` | inventario | movimientos | `movimientoId, sku, solicitado, disponible` |
| `StockBajo` | inventario | (nadie aún; ejercicio extra) | `sku, stock, umbral` |

**Regla de oro:** `id` del evento es la clave de idempotencia. Un consumidor debe poder recibir
el mismo evento dos veces sin efectos dobles.

Los contratos viven en `packages/contratos/`:
- `eventos.schema.json` (JSON Schema, **fuente de verdad** compartida entre lenguajes).
- TS: tipos/validación con **Zod**. Python: modelos con **Pydantic**.
- Ejercicio de la fase 7: mantener ambos alineados con el JSON Schema.

---

## 4. Estructura del monorepo

```
inventario-lab/
├── GUIA.md
├── PROGRESO.md
├── package.json              # workspaces npm (o pnpm)
├── packages/
│   ├── infra/                # app SST #1: temas SNS + SSM
│   │   └── sst.config.ts
│   └── contratos/            # JSON Schema + tipos TS
├── services/
│   ├── movimientos/          # app SST #2 (TypeScript)
│   │   ├── sst.config.ts
│   │   └── src/handlers/{api,eventos}.ts
│   └── inventario/           # app SST #3 (Python)
│       ├── sst.config.ts
│       ├── pyproject.toml    # gestionado con uv
│       └── src/inventario/{api,eventos,repositorio}.py
└── web/                      # app SST #4 (React + Vite)
    └── sst.config.ts
```

**Decisión deliberada:** cada carpeta es **su propia app SST** (igual que cada repo de adogtame)
y se conectan por **SSM Parameter Store**, no por imports. Así se practica el mismo modelo que en
el trabajo aunque todo viva en un solo repo.
*Alternativa a comentar con el usuario:* una sola app SST con todo enlazado (`link`) es más simple,
pero esconde el desacoplamiento que se quiere aprender.

**Orden de despliegue:** `infra` → `inventario` y `movimientos` (cualquier orden) → `web`.

**Convención SSM:** `/inventario-lab/<stage>/<recurso>`, por ejemplo
`/inventario-lab/<stage>/topics/movimientos-events-arn`.

**Stage personal:** el usuario debe usar su nombre como stage (`--stage <nombre>`) para no chocar con nadie.

---

## 5. Requisitos previos (Fase 0)

- Node.js LTS y npm (o pnpm).
- Python 3.12+ y **uv** (SST usa uv para empaquetar funciones Python; verificar en la doc de SST).
- AWS CLI con un **perfil** configurado (`aws sts get-caller-identity --profile <perfil>` debe responder).
- Cuenta de AWS con presupuesto/alerta de costos creada (AWS Budgets, p. ej. USD 5).
- Git.

**Criterio de aceptación:** los comandos `node -v`, `python --version`, `uv --version`,
`aws sts get-caller-identity --profile <perfil>` funcionan.

---

## 6. Fases

Cada fase tiene: **Concepto → Tareas → Criterios de aceptación → Preguntas de control**.

### Fase 1 — Monorepo e infraestructura base (`packages/infra`)

**Concepto:** Infraestructura como código; stages; recursos compartidos publicados en SSM.

**Tareas**
1. Crear el monorepo con workspaces y `PROGRESO.md`.
2. Inicializar SST en `packages/infra` (`home: "aws"`, perfil y región en `providers`).
3. Crear dos temas SNS: `MovimientosEvents` e `InventarioEvents`.
4. Guardar sus ARN en SSM (`aws.ssm.Parameter`) con la convención de la sección 4.
5. `removal: "remove"` salvo en `prod`; `protect` solo en `prod`.
6. Desplegar con `npx sst deploy --stage <nombre>`.

**Criterios de aceptación**
- En la consola de AWS existen ambos temas y ambos parámetros SSM.
- `sst deploy` dos veces seguidas no produce cambios (idempotencia del IaC).

**Preguntas de control**
- ¿Por qué guardamos el ARN en SSM en vez de copiarlo en el código de los servicios?
- ¿Qué pasaría al hacer `sst remove` en `infra` con los servicios aún desplegados?

### Fase 2 — Servicio `movimientos` (TypeScript): API + persistencia

**Concepto:** Lambda + API Gateway HTTP; validación en el borde; cada servicio es dueño de sus datos.

**Tareas**
1. App SST en `services/movimientos`.
2. Tabla DynamoDB `Movimientos` (PK `movimientoId`; opcional GSI por `sku`), modo *on-demand*.
3. API HTTP con rutas:
   - `POST /movimientos` → valida con **Zod** (`sku` no vacío, `tipoMovimiento` ∈ {ENTRADA, SALIDA}, `cantidad` entero > 0), guarda con `estado: "PENDIENTE"`, responde `202 Accepted` con el `movimientoId`.
   - `GET /movimientos` y `GET /movimientos/{id}`.
   - `GET /health`.
4. Opción de framework: empezar **sin framework** (un handler por ruta, como adogtame). Como extra,
   reescribir con **Hono** y comparar.
5. Dar permisos con `link` de SST a la tabla.

**Criterios de aceptación**
- `curl -X POST .../movimientos` crea un ítem visible en DynamoDB.
- Un body inválido devuelve `400` con un mensaje claro.

**Preguntas de control**
- ¿Por qué `202` y no `201`?
- ¿Qué ventaja tiene que `inventario` **no** pueda leer la tabla `Movimientos` directamente?

### Fase 3 — Publicar eventos desde `movimientos`

**Concepto:** pub/sub con SNS; atributos de mensaje para filtrar.

**Tareas**
1. Leer el ARN de `MovimientosEvents` desde SSM en `sst.config.ts` y obtener el tema con `sst.aws.SnsTopic.get(...)`.
2. Enlazar el tema a la función de la API (`link`) y publicar `MovimientoRegistrado` tras guardar,
   con `MessageAttributes.tipo`.
3. Validar el evento contra el contrato antes de publicar.

**Criterios de aceptación**
- Con una suscripción temporal (email o cola de prueba) se ve el mensaje con el atributo `tipo`.

**Preguntas de control**
- Si guardar en DynamoDB funciona pero publicar en SNS falla, ¿qué estado queda? (Prepara la fase 6.)

### Fase 4 — Servicio `inventario` (Python): consumidor de eventos

**Concepto:** cola por consumidor, filtros, DLQ, visibility timeout, fallos parciales de lote, **idempotencia**.

**Tareas**
1. App SST en `services/inventario` con funciones en Python (runtime `python3.12`, proyecto con `uv`;
   **verificar en la doc de SST** cómo se declara el handler de Python).
2. Tablas DynamoDB: `Inventario` (PK `sku`, atributo `stock`) y `EventosProcesados` (PK `eventoId`, con **TTL**).
3. Cola `Eventos` + `EventosDlq` (`retry: 5`), `visibilityTimeout` ≈ 6× el timeout de la Lambda.
4. Suscribir la cola a `MovimientosEvents` con filtro `tipo: ["MovimientoRegistrado"]`.
5. Handler `eventos.py`:
   - Recorre `event["Records"]`, hace `json.loads(record["body"])` (sobre SNS) y luego el `Message`.
   - Valida con **Pydantic**.
   - Aplica el movimiento con **una transacción DynamoDB** (`transact_write_items`) que:
     a) inserta `eventoId` en `EventosProcesados` con `attribute_not_exists` (idempotencia), y
     b) actualiza el stock con `ADD`; para SALIDA, con condición `stock >= cantidad`.
   - Si la transacción falla por evento duplicado → ignorar (éxito).
   - Si falla por stock insuficiente → publicar `StockInsuficiente` (fase 5).
   - Cualquier otro error → agregar el `messageId` a `batchItemFailures`.
   - Activar `ReportBatchItemFailures` en la suscripción (verificar opción en SST).
6. API: `GET /inventario` y `GET /inventario/{sku}`.
7. Logs estructurados en JSON. Extra: **Powertools for AWS Lambda (Python)** para `Logger`,
   `BatchProcessor` e `Idempotency`, y comparar con la versión manual.

**Criterios de aceptación**
- Registrar una ENTRADA de 10 → `GET /inventario/{sku}` muestra 10 (tras unos segundos).
- Reenviar **el mismo** mensaje manualmente a la cola no duplica el stock.
- Un mensaje mal formado termina en la DLQ tras 5 intentos.

**Preguntas de control**
- ¿Por qué la marca de "evento procesado" y la actualización de stock deben ir en la misma transacción?
- ¿Qué pasa si el visibility timeout es menor que el timeout de la Lambda?

### Fase 5 — Eventos de vuelta: saga mínima

**Concepto:** comunicación bidireccional por eventos; compensación; consistencia eventual.

**Tareas**
1. `inventario` publica en `InventarioEvents`: `MovimientoAplicado` o `StockInsuficiente`; y `StockBajo` si el stock queda bajo un umbral (p. ej. 5).
2. `movimientos` crea su propia cola + DLQ, suscrita a `InventarioEvents` con filtro
   `tipo: ["MovimientoAplicado", "StockInsuficiente"]` (no recibe `StockBajo`).
3. Su consumidor actualiza `estado` a `APLICADO` o `RECHAZADO` (también idempotente).

**Criterios de aceptación**
- Una SALIDA mayor al stock termina con `estado: "RECHAZADO"` y el stock no cambia.
- `StockBajo` se publica pero `movimientos` no lo recibe (comprobar el filtro).

**Preguntas de control**
- Durante unos segundos el movimiento está `PENDIENTE`. ¿Cómo debería mostrarlo el frontend?

### Fase 6 — Patrón Outbox (en `movimientos`)

**Concepto:** garantizar que todo cambio guardado termine publicado (*at-least-once*).

**Tareas** (elegir una variante con el usuario)
- **A. Outbox con DynamoDB Streams (recomendada):** activar Streams en `Movimientos`; una Lambda
  suscrita al stream publica `MovimientoRegistrado` cuando se inserta un ítem. La API ya **no** publica.
- **B. Outbox con tabla + Cron** (como `OutboxRelay` en adogtame): la API escribe el movimiento y un
  ítem en `Outbox` en una transacción; un `sst.aws.Cron` publica los pendientes y los marca.

**Criterios de aceptación**
- Simulando un fallo de SNS (p. ej. permiso retirado temporalmente) el evento se publica al restaurarlo.

**Preguntas de control**
- ¿Por qué el Outbox obliga a que los consumidores sean idempotentes?

### Fase 7 — Contratos compartidos

**Concepto:** contratos de eventos como fuente de verdad entre lenguajes.

**Tareas**
1. `packages/contratos/eventos.schema.json` con los 4 eventos.
2. Generar o escribir los esquemas Zod (TS) y modelos Pydantic (Python) a partir de él.
3. Un test por lenguaje que valide eventos de ejemplo contra el JSON Schema.

**Criterios de aceptación**
- Cambiar un campo obligatorio en el JSON Schema hace fallar los tests de ambos lados.

### Fase 8 — Frontend (`web`)

**Concepto:** sitio estático en S3 + CloudFront; consistencia eventual en la UI.

**Tareas**
1. React + Vite en `web/`, desplegado con `sst.aws.StaticSite`.
2. URLs de las APIs inyectadas como `VITE_*` (leídas desde SSM o de los outputs).
3. Pantallas: formulario de movimiento, tabla de inventario, lista de movimientos con su estado.
4. Refrescar cada pocos segundos (o con **TanStack Query** y `refetchInterval`) para ver `PENDIENTE → APLICADO/RECHAZADO`.
5. Configurar **CORS** en ambas APIs.
6. *Extra (como adogtame):* un `sst.aws.Router` en `infra` con `/` → web, `/api/movimientos`, `/api/inventario` en un mismo dominio, sin CORS.

**Criterios de aceptación**
- Desde el navegador se registra una entrada y una salida rechazada, y se ven los estados cambiar.

### Fase 9 — Operación y cierre

**Tareas**
1. Revisar logs en CloudWatch siguiendo un `movimientoId` de punta a punta.
2. Crear una alarma simple: mensajes en DLQ > 0.
3. Scripts `deploy:<stage>` en cada paquete y un script raíz que despliegue en orden.
4. Extra: GitHub Actions que despliegue a un stage `dev` al hacer push.
5. Limpieza: `npx sst remove --stage <nombre>` en orden inverso (`web` → servicios → `infra`).

**Criterios de aceptación**
- El usuario explica con sus palabras el viaje de un evento de punta a punta.

---

## 7. Mapa con adogtame

| Concepto en este lab | Equivalente en adogtame |
|---|---|
| `packages/infra` + SSM | `adogtame-infra` + `/adogtame/<stage>/...` |
| `MovimientosEvents`, `InventarioEvents` | `AuthEvents`, `DogsEvents`, `RequestsEvents` |
| Cola + DLQ por servicio, filtro `tipo` | `Events` + `EventsDlq` en cada `*-ms` |
| Outbox (fase 6B) | `OutboxRelay` en `adogtame-dogs-ms` |
| `packages/contratos` | posible uso de `adogtame-shared` |
| Router (fase 8 extra) | `Edge` Router con `/api/<servicio>` |

## 8. Preguntas de control generales (para repasar al final)

1. ¿Qué diferencia hay entre SNS y SQS y por qué se usan juntos?
2. ¿Qué es un filtro de suscripción y dónde se evalúa?
3. ¿Qué garantiza una DLQ y qué **no** garantiza?
4. ¿Qué significa "at-least-once" y cómo te protege la idempotencia?
5. ¿Qué es la consistencia eventual y cómo se refleja en la UI?
6. ¿Por qué cada servicio tiene su propia tabla y su propia cola?

## 9. Errores típicos (dar pista antes que solución)

- **Doble parseo:** en SQS suscrita a SNS, `body` es el sobre SNS; el evento real está en `Message` (a menos que se use *raw message delivery*).
- **Filtro que no filtra:** el atributo `tipo` se puso en el cuerpo y no en `MessageAttributes`.
- **Permisos:** la Lambda no puede publicar/leer porque falta `link` o la política IAM.
- **Visibility timeout** menor que el timeout de la Lambda → mensajes procesados dos veces.
- **Stock negativo** por usar leer-luego-escribir en vez de una escritura condicional atómica.
- **Desplegar servicios antes que `infra`** → el parámetro SSM no existe.
- **Python:** dependencias no empaquetadas (revisar `pyproject.toml`/uv), handler mal referenciado.
- **CORS** olvidado en las APIs al conectar el frontend.
- **Stages olvidados** consumiendo recursos: listar y limpiar con `sst remove`.

## 10. Stack de referencia

| Área | Herramienta |
|---|---|
| IaC | SST (v4) sobre AWS |
| Cómputo | AWS Lambda (Node.js y Python 3.12) |
| APIs | API Gateway HTTP (`sst.aws.ApiGatewayV2`) |
| Datos | DynamoDB on-demand (+ Streams, TTL) |
| Mensajería | SNS + SQS + DLQ |
| Config | SSM Parameter Store, `sst.Secret` |
| TS | Zod, opcional Hono, AWS SDK v3 |
| Python | uv, Pydantic, boto3, opcional Powertools |
| Frontend | React + Vite, opcional TanStack Query |
| Tests | Vitest (TS), pytest (Python) |
