# Especificación Técnica de Arquitectura: Clon de PackageMate (V2 Enterprise)

---

## 1. Stack Tecnológico, Infraestructura y Seguridad Base

### 1.1. Stack Tecnológico

El sistema implementa una arquitectura desacoplada orientada a eventos para aislar las operaciones de I/O intensivas (scraping), la gestión de conexiones de larga duración (WebSockets de mensajería) y la capa de servicio HTTP.

```
                      +-------------------------------------------------+
                      |          Cliente Web (Vite + React 18)          |
                      +-------------------------------------------------+
                                     |                ^
                      REST (JWT HTTP)|                | SSE (Ticketed)
                                     v                |
+---------------------------------------------------------------------------------------+
| api_server (Node.js 22 LTS / Express)                                                 |
|  - RateLimitRedis Store                                                               |
|  - Auth (HS256), requirePasswordChange & Controller Layer                             |
|  - SSE Manager (Ticket validado en Redis vía GETDEL, TTL 60s)                         |
+---------------------------------------------------------------------------------------+
           |                                                      ^
  Encola   |                                                      | Consume
           v                                                      |
+---------------------------------------+       +---------------------------------------+
| BullMQ Producer                       |       | notificationQueue                     |
|  - Colas: queue_japanpost,            |       |  - Consumida por notificationWorker   |
|    queue_correoscl                    |       |  - Rate limit: 20 msgs / 60s          |
+---------------------------------------+       +---------------------------------------+
           |                                                               ^
           |                                                               | Encola
           v                                                               |
+---------------------------------------+       +---------------------------------------+
| tracking_worker (Proceso Aislado)     |       | whatsapp_service (Singleton Aislado)  |
|  - Worker pool por courier            |-----> |  - Container: packagemate_whatsapp... |
|  - Circuit Breakers en Redis          |       |  - Baileys Socket Engine              |
|  - Pre-filtrado checksum + $push      |       |  - CallMeBot Fallback (Admin Only)    |
|  - Scrapers (Cheerio) / Agregador     |       |  - Emisión de QR a SSE vía PubSub     |
+---------------------------------------+       +---------------------------------------+
           |                                                               |
           +--------------------+                   +----------------------+
                                v                   v
               +-------------------------------------------------+
               |              Redis 7 (Broker & State)           |
               |  - Colas: queue_japanpost, queue_correoscl      |
               |  - Circuit Breakers (`circuit:<carrier>:*`)     |
               |  - Estado WhatsApp (`whatsapp:latest_qr`, etc.) |
               |  - Rate Limit Store & PubSub                    |
               +-------------------------------------------------+
                                        |
               +-------------------------------------------------+
               |             MongoDB 6 (Persistencia)            |
               |  - Users, Packages, Checksums                   |
               +-------------------------------------------------+

```

* **Frontend (Capa de Presentación):**
* **Tooling & Runtime:** Vite 5+ con React 18+ (SPA).
* **Cliente HTTP:** Axios configurado con interceptores para inyección de token JWT en cabecera `Authorization: Bearer <TOKEN>`.
* **Streaming en Tiempo Real:** EventSource nativo consumiendo endpoints SSE mediante tickets efímeros de un solo uso.
* **Servidor Web de Producción:** Nginx Alpine configurado con `proxy_buffering off;` y `proxy_set_header Connection '';` en la ruta `/api/whatsapp/qr-stream` para garantizar el flujo de datos sin bloqueo de búfer.


* **Backend - API Server (`api_server`):**
* **Entorno:** Node.js 22 LTS (Active).
* **Framework:** Express.js 4.x modular.
* **Seguridad:** `helmet`, `cors` estricto, `express-rate-limit` respaldado por `rate-limit-redis`.
* **Autenticación:** JWT firmado exclusivamente mediante algoritmo simétrico **HS256** con expiración de 7 días. Contraseñas hasheadas mediante `bcrypt` (12 salt rounds). Middleware `requirePasswordChange` para cumplimiento de rotación de credenciales.
* **Planificador de Tareas:** BullMQ Repeatable Jobs en reemplazo de instancias locales de `node-cron`, garantizando la ejecución singleton del barrido periódico incluso si `api_server` escala horizontalmente.


* **Backend - Motor de Scraping y Tareas (`tracking_worker`):**
* **Procesamiento Asíncrono:** BullMQ 5+ sobre Redis 7 con colas segregadas por dominio: `queue_japanpost` y `queue_correoscl`.
* **Scraping y Parsing:** Axios con agentes HTTPS (`keepAlive: true`, timeouts estrictos de 10 s) y Cheerio para extracción declarativa sobre el DOM con aserciones estructurales.
* **Tolerancia a Fallos:** Circuit Breaker distribuido orquestado sobre Redis con sondeo atómico y detección de sondas huérfanas en `HALF_OPEN`.
* **Persistencia Atómica:** Deduplicación de eventos en memoria de aplicación mediante `Set` de checksums intra-carrier y mutación atómica concurrente (`findOneAndUpdate` condicionado por estado con reintento acotado de conciliación).


* **Backend - Pasarela de Notificaciones (`whatsapp_service`):**
* **Contenedor Singleton:** Proceso independiente con `container_name: packagemate_whatsapp_singleton` dedicado exclusivamente a mantener la sesión activa con WhatsApp.
* **Driver Principal:** `@whiskeysockets/baileys` multi-device procesando trabajos desde `notificationWorker` configurado con limitador de tasa a 20 msgs / 60s.
* **Driver Secundario (Fallback):** CallMeBot API (limitado exclusivamente al número del administrador del sistema).
* **Caché de Estado:** El último código QR generado y el estado de la conexión se persisten en Redis (`whatsapp:latest_qr`, `whatsapp:status`) para que clientes que abran el modal de forma tardía reciban el QR inmediatamente sin esperar un nuevo ciclo de emisión.


* **Persistencia y Caché:**
* **Base de Datos Principal:** MongoDB 6.0+ con Mongoose 8.x, configurada con autenticación obligatoria.
* **Caché, Estado y Colas:** Redis 7.0+ Alpine con persistencia AOF (`appendonly yes`).


* **Estrategia de Respaldos:**
* `mongo-data`: Tarea diaria mediante `mongodump` empaquetada en archivo comprimido `.tar.gz` y exportada a almacenamiento secundario.
* `baileys-session`: Respaldo incremental del directorio de claves y credenciales previo a cualquier actualización de contenedor.



---

### 1.2. Definición de Infraestructura (`docker-compose.yml`)

```yaml
services:
  mongodb:
    image: mongo:6.0
    restart: unless-stopped
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${MONGO_ROOT_USER:?Error: MONGO_ROOT_USER requerido}
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_ROOT_PASSWORD:?Error: MONGO_ROOT_PASSWORD requerido}
      MONGO_INITDB_DATABASE: packagemate
    volumes:
      - mongo-data:/data/db
    networks:
      - packagemate-net
    healthcheck:
      test: ["CMD", "mongosh", "-u", "${MONGO_ROOT_USER}", "-p", "${MONGO_ROOT_PASSWORD}", "--authenticationDatabase", "admin", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes", "--requirepass", "${REDIS_PASSWORD}"]
    volumes:
      - redis-data:/data
    networks:
      - packagemate-net
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  api_server:
    build:
      context: ./api_server
      dockerfile: Dockerfile
    restart: unless-stopped
    environment:
      - PORT=5000
      - NODE_ENV=production
      - MONGO_URI=mongodb://${MONGO_ROOT_USER}:${MONGO_ROOT_PASSWORD}@mongodb:27017/packagemate?authSource=admin
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - REDIS_PASSWORD=${REDIS_PASSWORD}
      - JWT_SECRET=${JWT_SECRET:?Error: JWT_SECRET no definido}
      - TRACKING_CRON_SCHEDULE=0 */2 * * *
      - ADMIN_INIT_EMAIL=${ADMIN_INIT_EMAIL}
      - ADMIN_INIT_PASSWORD=${ADMIN_INIT_PASSWORD}
      - ADMIN_INIT_PHONE=${ADMIN_INIT_PHONE}
    ports:
      - "5000:5000"
    depends_on:
      mongodb:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - packagemate-net
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:5000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"]
      interval: 15s
      timeout: 5s
      retries: 3

  tracking_worker:
    build:
      context: ./api_server
      dockerfile: Dockerfile.worker
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
    environment:
      - NODE_ENV=production
      - MONGO_URI=mongodb://${MONGO_ROOT_USER}:${MONGO_ROOT_PASSWORD}@mongodb:27017/packagemate?authSource=admin
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - REDIS_PASSWORD=${REDIS_PASSWORD}
      - AGGREGATOR_API_KEY=${AGGREGATOR_API_KEY}
    depends_on:
      mongodb:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - packagemate-net

  whatsapp_service:
    # container_name impone el patrón singleton e impide el escalamiento horizontal accidental
    container_name: packagemate_whatsapp_singleton
    build:
      context: ./api_server
      dockerfile: Dockerfile.whatsapp
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 384M
    environment:
      - NODE_ENV=production
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - REDIS_PASSWORD=${REDIS_PASSWORD}
      - WHATSAPP_AUTH_DIR=/app/auth_info_baileys
      - CALLMEBOT_API_KEY=${CALLMEBOT_API_KEY}
      - CALLMEBOT_ADMIN_PHONE=${ADMIN_INIT_PHONE}
    volumes:
      - baileys-session:/app/auth_info_baileys
    depends_on:
      redis:
        condition: service_healthy
    networks:
      - packagemate-net

  client:
    build:
      context: ./client
      dockerfile: Dockerfile
    restart: unless-stopped
    ports:
      - "3000:80"
    depends_on:
      api_server:
        condition: service_healthy
    networks:
      - packagemate-net

volumes:
  mongo-data:
  redis-data:
  baileys-session:

networks:
  packagemate-net:
    driver: bridge

```

---

### 1.3. Matriz de Variables de Entorno y Seguridad de Secretos

| Variable | Descripción | Servicio Destino | Formato / Restricción |
| --- | --- | --- | --- |
| `JWT_SECRET` | Clave simétrica de firma criptográfica HS256 | `api_server` | Cadena aleatoria $\ge 64$ caracteres |
| `REDIS_PASSWORD` | Autenticación del broker Redis | Todos | Cadena alfanumérica segura |
| `MONGO_ROOT_USER` | Usuario administrativo de MongoDB | `mongodb`, `api_server`, `tracking_worker` | Cadena alfanumérica |
| `MONGO_ROOT_PASSWORD` | Contraseña de MongoDB | `mongodb`, `api_server`, `tracking_worker` | Cadena alfanumérica segura |
| `ADMIN_INIT_EMAIL` | Correo para inicialización del primer Admin | `api_server` | Email válido (semillero de arranque) |
| `ADMIN_INIT_PASSWORD` | Contraseña inicial del primer Admin | `api_server` | Cadena $\ge 12$ caracteres |
| `ADMIN_INIT_PHONE` | Teléfono internacional del Admin | `api_server`, `whatsapp_service` | Formato E.164 (`+569XXXXXXXX`) |
| `AGGREGATOR_API_KEY` | Token de servicio de respaldo (17TRACK/Ship24) | `tracking_worker` | Cadena hexadecimal / UUID |
| `CALLMEBOT_API_KEY` | Clave API personal para el número del Admin | `whatsapp_service` | String provisto por gateway CallMeBot |

---

## 2. Ingeniería de Requisitos, Resiliencia y Fallbacks

### 2.1. Clasificación Determinista de Couriers (`carrierDetector.js`)

Se eliminan todas las expresiones regulares de couriers no contemplados (UPS, USPS, FedEx, Amazon) y la lógica de desambiguación doméstica japonesa. Si el identificador no cumple estrictamente con el patrón de Japan Post o Correos de Chile, se rechaza inmediatamente con un error tipado de validación:

```javascript
// api_server/src/utils/carrierDetector.js
import { CarrierNotFoundException } from '../exceptions/CarrierNotFoundException.js';

const PATTERNS = {
  JAPAN_POST: /^[A-Z]{2}[0-9]{9}JP$/,
  CORREOS_CHILE_INT: /^[A-Z]{2}[0-9]{9}CL$/,
  // 12 dígitos exactos sin prefijo telefónico móvil de Chile (569)
  CORREOS_CHILE_NAC: /^(?!569)[0-9]{12}$/
};

export function detectCarrier(trackingNumber) {
  if (!trackingNumber || typeof trackingNumber !== 'string') {
    throw new CarrierNotFoundException('Número de seguimiento no provisto o inválido');
  }

  const clean = trackingNumber.trim().toUpperCase();

  if (PATTERNS.JAPAN_POST.test(clean)) {
    return 'japanpost';
  }

  if (PATTERNS.CORREOS_CHILE_INT.test(clean) || PATTERNS.CORREOS_CHILE_NAC.test(clean)) {
    return 'correos_chile';
  }

  throw new CarrierNotFoundException(
    `La guía '${clean}' no corresponde a Japan Post (*JP) ni a Correos de Chile (*CL / 12 dígitos no telefónicos).`
  );
}

```

---

### 2.2. Requisitos del Sistema e Historias de Usuario

#### Requisitos Funcionales (RF)

* **RF-01 (Autenticación, Multi-tenancy, Paginación y Control de Acceso):**
* Registro, login con JWT (HS256) y segregación de datos por `userId`.
* El endpoint `GET /api/packages` admite paginación obligatoria (`page`, `limit` con tope de 100 registros por consulta; valores predeterminados: `page=1`, `limit=20`).
* **Enforcement de Contraseña Inicial:** El middleware global `requirePasswordChange` intercepta todas las peticiones autenticadas. Si el usuario tiene `mustChangePassword === true`, bloquea cualquier operación con código HTTP `403 Forbidden` (`PASSWORD_CHANGE_REQUIRED`), permitiendo únicamente el acceso a `POST /api/auth/change-password` y `POST /api/auth/logout`.


* **RF-02 (Clasificación Estricta):** Validación sintáctica vía `CarrierDetector`. Rechazo automático con HTTP `422 Unprocessable Entity` (`CarrierNotFoundException`) ante cualquier código fuera del alcance cerrado.
* **RF-03 (Scraping Defensivo de Japan Post):** Extracción sobre endpoint público mediante Axios con timeouts estrictos de 10 s y validación semántica en Cheerio (`table.tableType01`). Ante alteración del DOM, arroja `ScraperStructureException`.
* **RF-04 (Consulta a Correos de Chile y Manejo de 404):** Consumo del servicio de Correos de Chile. Si responde HTTP 404 (bulto no internado o no registrado en planta CEN), el sistema no computa fallo de scraping y establece el estado local del proveedor como `PRE_TRANSIT`.
* **RF-05 (Orquestación Desacoplada Japón $\to$ Chile):** Para guías `*JP`, el despachador encola dos trabajos independientes (`queue_japanpost` y `queue_correoscl`). Cada worker ejecuta su consulta respetando la cuota del courier correspondiente y realiza el merge de eventos de forma atómica en MongoDB.
* **RF-06 (Fusión Continua de Eventos e Idempotencia Intra-Carrier):** La incorporación de eventos históricos al arreglo `history` se ejecuta en todas las sincronizaciones exitosas mediante pre-filtrado en memoria de aplicación usando `Set` de `rawChecksum` (que incluye `sourceCarrier`) y `$push` de registros no duplicados, con independencia de si el estado consolidado avanzó o no.
* **RF-07 (Evaluación Monótona con Reintento Acotado ante Colisión):**
* El estado solo avanza si `canTransition(current, candidate)` lo autoriza.
* La actualización se ejecuta de forma optimista con `findOneAndUpdate({ _id: pkgId, status: currentStatus }, ...)`.
* Si la operación retorna `null` debido a que un worker concurrente modificó el estado en paralelo, el worker actual ejecuta **un único reintento de conciliación**:
1. Vuelve a consultar el documento en base de datos (`status` y `lastNotifiedAt`).
2. Re-evalúa `canTransition(nuevoStatusPersistido, candidate)`.
3. Si la transición sigue siendo válida, reintenta la mutación; en caso contrario, descarta la actualización de estado de forma silenciosa, garantizando que el `status` consolidado nunca quede rezagado frente al mayor evento del `history`.




* **RF-08 (Despacho Selectivo y Anti-Spam Simplificado):**
* El worker resuelve la verificación del usuario cargando la relación mediante `findById(pkgId, "...").populate("userId", "isPhoneVerified phone")`.
* Se emiten alertas de WhatsApp únicamente ante transiciones monótonas válidas hacia los estados de alto impacto (`CUSTOMS_HOLD`, `OUT_FOR_DELIVERY`, `DELIVERED`, `EXCEPTION`), verificando concurrentemente que `pkg.notificationsEnabled === true` y que `pkg.userId.isPhoneVerified === true`.
* **Debounce Consistente por Reconciliación:** La condición de supresión de ráfagas evalúa si transcurrieron $\ge 60\text{ s}$ desde la última alerta persistida en `lastNotifiedAt` (exento si el nuevo estado es `DELIVERED`). Si dos workers compiten simultáneamente, la serialización del bloqueo optimista garantiza que el worker perdedor re-lea el `lastNotifiedAt` fresco en su reintento y descarte la alerta redundante.
* **Actualización Estricta de Marca Temporal:** La marca `lastNotifiedAt` se actualiza en base de datos mediante un `updateOne` atómico **única y exclusivamente después** de encolar con éxito el trabajo a `notificationQueue`. Si las alertas están deshabilitadas o el usuario no está verificado, `lastNotifiedAt` permanece intacto, evitando pérdidas de alertas futuras.
* **Deduplicación y Retención Acotada en Cola:** Las alertas se encolan en `notificationQueue` con el identificador determinista `jobId: notif:${pkgId}:${candidateStatus}` y opciones de retención finita:
```javascript
removeOnComplete: { age: 3600, count: 500 },
removeOnFail: { age: 86400 }

```


Esto acota la deduplicación a una ventana móvil de 1 hora, absorbiendo colisiones inmediatas entre workers concurrentes sin bloquear reintentos legítimos de entrega o re-inspecciones aduaneras días después.


* **RF-09 (Verificación de Teléfono con Protección Anti-Abuso Integral):**
* Las notificaciones solo se despachan a usuarios con `isPhoneVerified: true`.
* **Cooldown de Solicitud:** El endpoint `POST /api/auth/verify-phone-request` exige un intervalo mínimo de 60 segundos entre solicitudes por usuario (`SET otp_cooldown:<userId> 1 NX EX 60`), respondiendo HTTP `429 Too Many Requests` ante intentos de saturación saliente.
* **Protección Anti-Fuerza Bruta:** El endpoint `POST /api/auth/verify-phone-confirm` implementa un contador en Redis (`otp_attempts:<userId>`). Tras 5 intentos fallidos consecutivos, bloquea la verificación del usuario por 15 minutos respondiendo HTTP `429 Too Many Requests`.


* **RF-10 (Streaming de QR Seguro vía SSE):** Streaming del código QR de Baileys restringido al rol `admin` mediante tickets efímeros (TTL 60 s) consumidos con `GETDEL` en Redis.
* **RF-11 (Planificador Distribuido con BullMQ):** Barrido automático periódico orquestado mediante BullMQ Repeatable Jobs, evitando duplicidad de ejecuciones entre réplicas de la API.
* **RF-12 (Gestión de Notificaciones por Paquete):** El endpoint `PATCH /api/packages/:id` permite al usuario alternar individualmente la bandera `notificationsEnabled` (`true`/`false`).

#### Requisitos No Funcionales (RNF)

* **RNF-01 (Desacoplamiento y Rendimiento del Event Loop):** El scraping y la mensajería corren en procesos y contenedores Docker independientes (`tracking_worker` y `whatsapp_service`), impidiendo la degradación de latencias de la API REST.
* **RNF-02 (Rate Limiting en Workers y Sincronización de Jitter):**
* Los limitadores de tasa se declaran e instancian obligatoriamente en el constructor de los **`Worker`** de BullMQ, nunca en la definición de la interfaz `Queue`:
* `japanPostWorker`: `limiter: { max: 3, duration: 5000 }` (en `tracking_worker`).
* `correosChileWorker`: `limiter: { max: 5, duration: 5000 }` (en `tracking_worker`).
* `notificationWorker`: `limiter: { max: 20, duration: 60000 }` (en `whatsapp_service`, equivalente a un ritmo medio de 1 mensaje cada 3 segundos).


* La cadencia de despacho en el daemon de WhatsApp aplica un jitter coordinado de $3000\text{ ms} \pm 500\text{ ms}$ entre peticiones consecutivas, alineando el retraso estocástico anti-heurística con la tasa permitida por el limitador de BullMQ.


* **RNF-03 (Resiliencia y Reintentos):** Reintentos automáticos en BullMQ con backoff exponencial y jitter: $t = 2^{\text{intento}} \times 1000\text{ ms} \pm 500\text{ ms}$ (máximo 3 intentos).
* **RNF-04 (Sanitización y Seguridad Perimetral):** Protección NoSQL injection mediante sanitización de operadores en Mongoose, headers seguros vía Helmet y rate limiting por IP respaldado en Redis.
* **RNF-05 (Aislamiento de Sesión y Prevención de Memory Leaks):** Persistencia obligatoria de `baileys-session` en volumen Docker. Reasignación de listeners en el cliente Baileys invocando `sock.ev.removeAllListeners()` previo a reconectar el WebSocket.

#### Historias de Usuario (HU)

* **HU-01 (Registro de Guía):** Como usuario autenticado, quiero ingresar una guía de Japan Post (`*JP`) o Correos de Chile para incorporarla a mi monitoreo sin riesgo de clasificaciones erróneas.
* **HU-02 (Línea de Tiempo Completa):** Como usuario, quiero ver todos los eventos históricos generados tanto en Japón como en Chile cronológicamente unificados, aun cuando el estado principal del paquete no haya cambiado entre revisiones.
* **HU-03 (Notificaciones Oportunas sin Spam):** Como usuario con teléfono verificado y notificaciones activas, quiero recibir un mensaje de WhatsApp únicamente cuando mi paquete esté retenido en aduanas, salga a reparto o sea entregado, con supresión de alertas en ráfagas inmediatas y sin spam de tránsito regular.
* **HU-04 (Actualización Manual No Bloqueante):** Como usuario, quiero pulsar el botón de refrescar y que el sistema procese la actualización en segundo plano sin congelar la interfaz.
* **HU-05 (Activación Segura de WhatsApp):** Como administrador, quiero escanear el código QR de vinculación de WhatsApp desde el panel mediante una conexión protegida que solo yo pueda visualizar.
* **HU-06 (Recuperación de Excepciones y Liberación Aduanera):** Como usuario cuyo paquete cayó en intento fallido de entrega (`EXCEPTION`) o estuvo retenido en aduanas (`CUSTOMS_HOLD`), quiero que el sistema continúe actualizándolo y me alerte cuando vuelva a salir a reparto, retome tránsito o sea entregado exitosamente.

---

### 2.3. Mapeo de Estados por Courier y Transición Monótona

#### Mapeo de Estados Crudos a Estados Canónicos

| Courier | `rawStatus` (Texto original extraído) | `canonicalStatus` |
| --- | --- | --- |
| **Japan Post** | `Posting/Collection` | `PRE_TRANSIT` |
| **Japan Post** | `Arrival at outward office of exchange` | `IN_TRANSIT` |
| **Japan Post** | `Dispatch from outward office of exchange` | `IN_TRANSIT` |
| **Japan Post** | `Arrival at inward office of exchange` | `IN_TRANSIT` |
| **Japan Post** | `Held by import customs` / `Item presented to import customs` | `CUSTOMS_HOLD` |
| **Japan Post** | `Departure from inward office of exchange` | `IN_TRANSIT` |
| **Japan Post** | `Final delivery` / `Delivery completed` | `DELIVERED` |
| **Correos Chile** | `Envío recepcionado en punto de origen` | `PRE_TRANSIT` |
| **Correos Chile** | `En tránsito a planta de clasificación` / `Llegada a CEN` | `IN_TRANSIT` |
| **Correos Chile** | `En proceso de internación` / `Retenido en Aduana` | `CUSTOMS_HOLD` |
| **Correos Chile** | `Envío asignado a cartero` / `En reparto a domicilio` | `OUT_FOR_DELIVERY` |
| **Correos Chile** | `Entregado exitosamente` / `Recepcionado en destino` | `DELIVERED` |
| **Ambos** | `Intento de entrega fallido` / `Dirección incompleta` / `Rechazado` | `EXCEPTION` |

#### Matriz de Pesos y Función de Transición Monótona

Resuelve el bloqueo terminal del estado `EXCEPTION` y permite el flujo bidireccional entre `CUSTOMS_HOLD` e `IN_TRANSIT`:

```javascript
// api_server/src/utils/statusManager.js
export const STATE_WEIGHTS = {
  PRE_TRANSIT: 10,
  IN_TRANSIT: 20,
  CUSTOMS_HOLD: 25,        // Estado lateral de fiscalización
  OUT_FOR_DELIVERY: 40,
  DELIVERED: 50,
  EXCEPTION: 99            // Contingencia logística (no terminal)
};

export const NOTIFIABLE_STATES = new Set([
  'CUSTOMS_HOLD',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'EXCEPTION'
]);

export function isNotifiable(status) {
  return NOTIFIABLE_STATES.has(status);
}

export function canTransition(current, candidate) {
  // 1. Estados idénticos o paquete ya entregado: sin transición
  if (current === candidate || current === 'DELIVERED') {
    return false;
  }

  // 2. Transiciones siempre válidas hacia estados terminales o de contingencia
  if (candidate === 'DELIVERED' || candidate === 'EXCEPTION') {
    return true;
  }

  // 3. Salida de excepción: se reanuda la operación logística regular
  if (current === 'EXCEPTION') {
    return true;
  }

  // 4. Salida explícita de aduana: permitir reingreso a tránsito tras liberación
  if (current === 'CUSTOMS_HOLD' && candidate === 'IN_TRANSIT') {
    return true;
  }

  // 5. Re-entrada a aduana desde tránsito (ej: segunda inspección o aforo aduanero)
  if (current === 'IN_TRANSIT' && candidate === 'CUSTOMS_HOLD') {
    return true;
  }

  // 6. Avance monótono regular según peso numérico
  return (STATE_WEIGHTS[candidate] || 0) > (STATE_WEIGHTS[current] || 0);
}

```

---

### 2.4. Circuit Breaker Distribuido con Sondeo Atómico en `HALF_OPEN`

* **Identificador de Claves en Redis:** `circuit:<carrier>:state`, `circuit:<carrier>:failures`, `circuit:<carrier>:cooldown`, `circuit:<carrier>:probe`.
* **Regla de Fallo:** Errores de red (5xx, timeouts) o de marcado (`ScraperStructureException`) incrementan fallos. **El HTTP 404 de Correos de Chile no es un fallo**.
* **Degradación Comprobada:** Las peticiones locales se ejecutan normalmente mientras el circuito está `CLOSED`. El agregador externo (17TRACK/Ship24) **solo** se invoca si el circuito está `OPEN` o si la sonda en `HALF_OPEN` falla.

```javascript
// api_server/src/services/circuitBreaker.js
export class CircuitBreaker {
  constructor(redisClient, threshold = 5, cooldownSec = 300) {
    this.redis = redisClient;
    this.threshold = threshold;
    this.cooldownSec = cooldownSec;
  }

  async canExecute(carrier) {
    const state = await this.redis.get(`circuit:${carrier}:state`) || 'CLOSED';

    if (state === 'CLOSED') {
      return true;
    }

    if (state === 'OPEN') {
      // 1. Verificar si aún está vigente el periodo de enfriamiento
      const isCoolingDown = await this.redis.exists(`circuit:${carrier}:cooldown`);
      if (isCoolingDown) {
        return false; // Continúa en enfriamiento, forzar fallback
      }

      // 2. Transición controlada: solo un worker adquiere el candado de prueba (sonda)
      const acquired = await this.redis.set(
        `circuit:${carrier}:probe`, 
        'locked', 
        'NX', 
        'EX', 
        30
      );

      if (acquired) {
        await this.redis.set(`circuit:${carrier}:state`, 'HALF_OPEN');
        return true; // Ejecuta la petición de sondeo
      }

      return false; // Otro worker ya está ejecutando la sonda
    }

    if (state === 'HALF_OPEN') {
      // Detección y recuperación de sonda huérfana (worker crasheado / reiniciado)
      const probeAlive = await this.redis.exists(`circuit:${carrier}:probe`);
      if (!probeAlive) {
        // La sonda expiró sin resolver: forzar reapertura y reactivar cooldown
        await this.redis.set(`circuit:${carrier}:state`, 'OPEN');
        await this.redis.set(`circuit:${carrier}:cooldown`, 'active', 'EX', this.cooldownSec);
        return false;
      }

      // Sonda en ejecución activa dentro del tiempo límite
      return false;
    }

    return false;
  }

  async recordSuccess(carrier) {
    await this.redis.set(`circuit:${carrier}:state`, 'CLOSED');
    // Limpieza integral de claves de control
    await this.redis.del(
      `circuit:${carrier}:failures`,
      `circuit:${carrier}:probe`,
      `circuit:${carrier}:cooldown`
    );
  }

  async recordFailure(carrier) {
    const failKey = `circuit:${carrier}:failures`;
    const failures = await this.redis.incr(failKey);

    // Solo se fija el TTL cuando se inicializa el contador de fallos consecutivos
    if (failures === 1) {
      await this.redis.expire(failKey, 600);
    }

    const state = await this.redis.get(`circuit:${carrier}:state`);
    
    // Si falla la sonda en HALF_OPEN o se alcanza el umbral de fallos consecutivos
    if (state === 'HALF_OPEN' || failures >= this.threshold) {
      await this.redis.set(`circuit:${carrier}:state`, 'OPEN');
      await this.redis.set(`circuit:${carrier}:cooldown`, 'active', 'EX', this.cooldownSec);
      await this.redis.del(`circuit:${carrier}:probe`);
    }
  }
}

```

---

### 2.5. Autenticación SSE mediante `GETDEL` y Caché de WhatsApp

1. El administrador autenticado solicita un ticket de streaming vía `POST /api/whatsapp/qr-ticket`.
2. El servidor almacena el ticket en Redis con expiración segura de 60 segundos:
```javascript
await redis.set(`sse_ticket:${token}`, userId, 'EX', 60);

```


3. El frontend inicializa el canal EventSource (`/api/whatsapp/qr-stream?ticket=<token>`).
4. El servidor ejecuta `GETDEL sse_ticket:<token>`. Si el ticket es nulo, expira o no pertenece a un administrador, rechaza la conexión con HTTP 401/403.
5. Si el ticket es válido, emite inmediatamente el último estado almacenado en `whatsapp:latest_qr` y `whatsapp:status`.

---

### 2.6. Gestión de Riesgos de Baileys y Fallback de Notificación

* **Mitigación de Baneo:** Jitter de $3000\text{ ms} \pm 500\text{ ms}$ entre envíos en `whatsapp_service` y restricción a SIM dedicada.
* **Limitación de CallMeBot:** Se documenta formalmente que CallMeBot es un **fallback exclusivo para el administrador del sistema** (`ADMIN_INIT_PHONE`), dado que la API Key está ligada a un único número. Si Baileys falla, los usuarios regulares no recibirán WhatsApp hasta la reconexión del socket principal; las alertas fallidas se reintentan en `notificationQueue` con backoff.

---

### 2.7. Verificación de Teléfono y Bootstrap Atómico de Administrador

* **Bootstrap Atómico e Idempotente del Administrador:** En el arranque de `api_server`, la cuenta administradora se registra utilizando una mutación atómica a nivel de motor de base de datos con `upsert: true` y `$setOnInsert`. Si dos réplicas inician concurrentemente, MongoDB resuelve la inserción en el primer intento sin colisiones `E11000` ni caídas en los logs:

```javascript
// api_server/src/config/bootstrap.js
import bcrypt from 'bcrypt';
import User from '../models/User.js';

export async function bootstrapAdmin() {
  const adminEmail = process.env.ADMIN_INIT_EMAIL;
  if (!adminEmail) return;

  const passwordHash = await bcrypt.hash(process.env.ADMIN_INIT_PASSWORD, 12);

  await User.findOneAndUpdate(
    { email: adminEmail.toLowerCase() },
    {
      $setOnInsert: {
        email: adminEmail.toLowerCase(),
        passwordHash,
        phone: process.env.ADMIN_INIT_PHONE,
        isPhoneVerified: true,
        mustChangePassword: true,
        role: 'admin'
      }
    },
    { upsert: true, new: true }
  );
}

```

* **Flujo OTP de Teléfono con Protección Anti-Spam y Fuerza Bruta:**
1. `POST /api/auth/verify-phone-request`:
* Verifica `SET otp_cooldown:<userId> "active" NX EX 60`. Si el comando retorna `null` (solicitud previa aún en enfriamiento), rechaza la petición con HTTP `429 Too Many Requests`.
* Genera un código de 6 dígitos numéricos, lo guarda en Redis (`otp:<userId>` con TTL de 5 minutos), reinicia el contador `otp_attempts:<userId>` y encola un trabajo en `notificationQueue` para que el bot de WhatsApp envíe el código al número registrado.


2. `POST /api/auth/verify-phone-confirm`: Recibe `{ code }`.
* Verifica `otp_attempts:<userId>`. Si el valor es $\ge 5$, rechaza la petición con HTTP `429 Too Many Requests`.
* Compara el código con el valor en Redis. Si no coincide, incrementa `otp_attempts:<userId>` (con TTL de 15 minutos) y responde HTTP `400 Bad Request`.
* Si coincide, actualiza `isPhoneVerified: true` en MongoDB, elimina las claves `otp:<userId>`, `otp_attempts:<userId>` y `otp_cooldown:<userId>`, y retorna confirmación exitosa.





---

## 3. Estructura del Proyecto y Pipeline CI/CD

### 3.1. Árbol de Directorios del Repositorio

```text
packagemate-clone/
├── .github/
│   └── workflows/
│       └── ci-cd.yml                   # Pipeline CI/CD en GitHub Actions (Fase 1)
├── docker-compose.yml                  # Orquestador multi-contenedor
├── .env.example                        # Variables de entorno
├── .gitignore
├── README.md
│
├── api_server/                         # Backend Node.js
│   ├── Dockerfile                      # Imagen para api_server (HTTP API)
│   ├── Dockerfile.worker               # Imagen para tracking_worker
│   ├── Dockerfile.whatsapp             # Imagen para whatsapp_service (Singleton)
│   ├── package.json
│   ├── src/
│   │   ├── index.js                    # Bootstrap del servidor Express
│   │   ├── worker.js                   # Bootstrap de workers BullMQ
│   │   ├── whatsapp.js                 # Bootstrap del daemon Baileys
│   │   │
│   │   ├── config/
│   │   │   ├── database.js             # Conexión Mongoose autenticada
│   │   │   ├── redis.js                # Conexión IoRedis compartida
│   │   │   ├── bootstrap.js            # Bootstrap atómico de administrador
│   │   │   └── env.js
│   │   │
│   │   ├── controllers/
│   │   │   ├── authController.js       # Registro, Login, Cambio de Password y Verificación OTP
│   │   │   ├── packageController.js    # CRUD de paquetes paginado
│   │   │   └── whatsappController.js   # Generación de tickets SSE y streaming
│   │   │
│   │   ├── middlewares/
│   │   │   ├── authMiddleware.js       # Validación JWT (HS256) y RBAC
│   │   │   ├── requirePasswordChange.js # Enforcement de rotación de credenciales
│   │   │   ├── rateLimiter.js          # Rate limiter respaldado en Redis
│   │   │   └── errorHandler.js
│   │   │
│   │   ├── models/
│   │   │   ├── User.js
│   │   │   └── Package.js
│   │   │
│   │   ├── queues/
│   │   │   ├── queueManager.js         # BullMQ queues y Repeatable Schedulers
│   │   │   └── processors/
│   │   │       ├── japanPostProcessor.js
│   │   │       ├── correosChileProcessor.js
│   │   │       └── notificationProcessor.js
│   │   │
│   │   ├── services/
│   │   │   ├── scraperService.js       # Orquestador y selector de fallback
│   │   │   ├── circuitBreaker.js       # Circuit Breaker distribuido en Redis
│   │   │   ├── trackers/
│   │   │   │   ├── carrierTracker.js   # Interfaz base
│   │   │   │   ├── japanPostTracker.js # Scraper Cheerio Japan Post
│   │   │   │   ├── correosChileTracker.js # Consumidor API Correos de Chile
│   │   │   │   └── aggregatorFallbackTracker.js # Adaptador 17TRACK / Ship24
│   │   │   └── whatsapp/
│   │   │       ├── whatsAppProvider.js
│   │   │       ├── baileysClient.js    # WebSocket client con reset de listeners
│   │   │       └── callMeBotClient.js  # HTTP client para fallback admin
│   │   │
│   │   └── utils/
│   │       ├── carrierDetector.js      # Clasificación estricta (JP y CL)
│   │       ├── statusManager.js        # Evaluación monótona canTransition
│   │       └── logger.js               # Logger estructurado Pino
│   │
│   └── tests/
│       ├── unit/
│       │   ├── carrierDetector.test.js
│       │   └── statusManager.test.js
│       ├── integration/
│       │   ├── japanPostScraper.test.js
│       │   └── correosChile.test.js
│       └── fixtures/
│           ├── japanpost_delivered.html
│           ├── japanpost_invalid_dom.html
│           └── correos_chile_response.json
│
└── client/                             # Frontend React + Vite
    ├── Dockerfile                      # Nginx con proxy_buffering off para SSE
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── components/
        │   ├── Navbar.jsx
        │   ├── Dashboard.jsx
        │   ├── PackageCard.jsx
        │   ├── Timeline.jsx
        │   └── Modals/
        │       ├── AddPackageModal.jsx
        │       └── WhatsAppQrModal.jsx
        ├── services/
        │   ├── api.js
        │   └── sseService.js
        └── styles/
            └── dashboard.module.css

```

---

### 3.2. Estrategia de Pruebas Automatizadas (ESM / Vitest)

```javascript
// api_server/tests/integration/japanPostScraper.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { JapanPostTracker } from '../../src/services/trackers/japanPostTracker.js';
import { ScraperStructureException } from '../../src/exceptions/ScraperStructureException.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('JapanPostTracker - Scraping con Fixtures Offline', () => {
  let tracker;

  beforeEach(() => {
    tracker = new JapanPostTracker();
  });

  it('debe extraer eventos y mapear estado DELIVERED desde HTML válido', async () => {
    const fixturePath = path.resolve(__dirname, '../fixtures/japanpost_delivered.html');
    const html = fs.readFileSync(fixturePath, 'utf8');

    const result = tracker.parseHtml(html, 'EJ123456789JP');

    expect(result.status).toBe('DELIVERED');
    expect(result.events.length).toBeGreaterThanOrEqual(1);
    expect(result.events[0]).toMatchObject({
      canonicalStatus: 'DELIVERED',
      sourceCarrier: 'japanpost'
    });
  });

  it('debe arrojar ScraperStructureException si falta la tabla esperada', () => {
    const fixturePath = path.resolve(__dirname, '../fixtures/japanpost_invalid_dom.html');
    const html = fs.readFileSync(fixturePath, 'utf8');

    expect(() => tracker.parseHtml(html, 'EJ123456789JP'))
      .toThrow(ScraperStructureException);
  });
});

```

---

## 4. Modelado de Datos y Estado Global en Redis

### 4.1. Esquemas de Datos de MongoDB (Mongoose)

```javascript
// api_server/src/models/User.js
import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    lowercase: true, 
    trim: true, 
    index: true 
  },
  passwordHash: { 
    type: String, 
    required: true 
  },
  phone: { 
    type: String, 
    required: true, 
    trim: true // Formato internacional verificado (ej: +569XXXXXXXX)
  },
  isPhoneVerified: { 
    type: Boolean, 
    default: false 
  },
  mustChangePassword: {
    type: Boolean,
    default: false
  },
  role: { 
    type: String, 
    enum: ['user', 'admin'], 
    default: 'user' 
  }
}, { timestamps: true });

export default mongoose.model('User', UserSchema);

```

```javascript
// api_server/src/models/Package.js
import mongoose from 'mongoose';
import crypto from 'node:crypto';

/**
 * Genera un hash MD5 normalizado para la deduplicación intra-carrier de eventos.
 * 
 * NOTA DE DISEÑO (Intra-Carrier Deduplication & Audit Trail):
 * Se incluye 'sourceCarrier' deliberadamente en la cadena del hash.
 * 
 * Motivo:
 * Japan Post y Correos de Chile reportan en idiomas, zonas horarias y formatos dispares
 * ('Arrival at inward office of exchange' vs 'Envío recepcionado en punto de origen').
 * Intentar colapsar eventos entre operadores por coincidencia de texto crudo es inviable,
 * y colapsar por canonicalStatus sacrifica la granularidad y la trazabilidad de qué operador
 * emitió cada hito en la línea de tiempo. Al incluir 'sourceCarrier', se garantiza idempotencia
 * estricta para cada operador sin falsos positivos ni pérdida de eventos consecutivos del mismo
 * courier, manteniendo un timeline transparente en la UI.
 */
export function generateEventChecksum(sourceCarrier, date, rawStatus, location) {
  const normCarrier = (sourceCarrier || '').trim().toLowerCase();
  const normDate = date instanceof Date ? date.toISOString() : new Date(date).toISOString();
  const normStatus = (rawStatus || '').trim().toLowerCase();
  const normLoc = (location || '').trim().toLowerCase();
  return crypto
    .createHash('md5')
    .update(`${normCarrier}|${normDate}|${normStatus}|${normLoc}`)
    .digest('hex');
}

const TrackingEventSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  rawStatus: { type: String, required: true },       // Texto crudo provisto por el courier
  canonicalStatus: {                                 // Estado unificado en la plataforma
    type: String, 
    enum: ['PRE_TRANSIT', 'IN_TRANSIT', 'CUSTOMS_HOLD', 'OUT_FOR_DELIVERY', 'DELIVERED', 'EXCEPTION'],
    required: true 
  },
  location: { type: String, default: 'Desconocido' },
  details: { type: String, default: '' },
  sourceCarrier: { 
    type: String, 
    enum: ['japanpost', 'correos_chile', 'aggregator'], 
    required: true 
  },
  rawChecksum: { type: String, required: true }      // MD5 normalizado con sourceCarrier
}, { _id: false });

const PackageSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true, 
    index: true 
  },
  title: { 
    type: String, 
    required: true, 
    trim: true 
  },
  trackingNumber: { 
    type: String, 
    required: true, 
    uppercase: true, 
    trim: true 
  },
  carrier: { 
    type: String, 
    enum: ['japanpost', 'correos_chile'], 
    required: true,
    index: true
  },
  status: { 
    type: String, 
    enum: ['PRE_TRANSIT', 'IN_TRANSIT', 'CUSTOMS_HOLD', 'OUT_FOR_DELIVERY', 'DELIVERED', 'EXCEPTION'], 
    default: 'PRE_TRANSIT', 
    index: true 
  },
  lastChecked: { type: Date, default: Date.now },
  lastNotifiedAt: { type: Date, default: null },     // Marca temporal para control de ráfagas anti-spam
  notificationsEnabled: { type: Boolean, default: true },
  history: [TrackingEventSchema]
}, { timestamps: true });

PackageSchema.index({ userId: 1, trackingNumber: 1 }, { unique: true });

export default mongoose.model('Package', PackageSchema);

```

---

### 4.2. Claves y Estructuras en Redis

| Clave / Patrón | Tipo | TTL | Propósito |
| --- | --- | --- | --- |
| `circuit:japanpost:state` | String | Persistente | `CLOSED`, `OPEN` o `HALF_OPEN`. |
| `circuit:correos_chile:state` | String | Persistente | `CLOSED`, `OPEN` o `HALF_OPEN`. |
| `circuit:<carrier>:failures` | Integer | 10 min | Contador atómico de fallos consecutivos (`INCR`), TTL fijado solo en `failures === 1`. |
| `circuit:<carrier>:cooldown` | String | 300 s | Marca de enfriamiento activo tras abrirse el circuito. |
| `circuit:<carrier>:probe` | String | 30 s | Candado de sondeo atómico adquirido con `SET NX` en `HALF_OPEN`. |
| `sse_ticket:<token>` | String | 60 s | Almacena `userId` de admin; consumido de forma destructiva mediante `GETDEL`. |
| `whatsapp:latest_qr` | String | 60 s | Base64/data-URL del último código QR emitido por Baileys. |
| `whatsapp:status` | String | Persistente | Estado del socket: `CONNECTED`, `CONNECTING`, `DISCONNECTED`. |
| `otp:<userId>` | String | 5 min | Código de 6 dígitos para verificación de número telefónico. |
| `otp_cooldown:<userId>` | String | 60 s | Cooldown anti-spam entre solicitudes consecutivas de código OTP (`SET NX`). |
| `otp_attempts:<userId>` | Integer | 15 min | Contador de intentos fallidos de OTP (bloqueo temporal al alcanzar 5). |
| `bull:queue_japanpost:*` | Streams | Gestionado BullMQ | Cola exclusiva para Japan Post (Rate limit: 3 req / 5s). |
| `bull:queue_correoscl:*` | Streams | Gestionado BullMQ | Cola exclusiva para Correos de Chile (Rate limit: 5 req / 5s). |
| `bull:queue_notifications:*` | Streams | Gestionado BullMQ | Cola de mensajería (`jobId: notif:<pkgId>:<status>`, retención completados: 1 h). |

---

## 5. Especificación de la API, Observabilidad y Diseño

### 5.1. Catálogo OpenAPI Resumido (Sin Couriers Ajenos)

```yaml
paths:
  /health:
    get:
      summary: Healthcheck del sistema
      responses:
        200:
          description: Base de datos y Redis operativos

  /api/auth/register:
    post:
      summary: Registro de usuario
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [email, password, phone]
              properties:
                email: { type: string }
                password: { type: string }
                phone: { type: string, example: "+56912345678" }

  /api/auth/logout:
    post:
      summary: Cierre de sesión (confirmación y descarte en cliente)
      security:
        - BearerAuth: []
      responses:
        204:
          description: Sesión finalizada exitosamente

  /api/auth/change-password:
    post:
      summary: Cambio obligatorio o voluntario de contraseña
      security:
        - BearerAuth: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [currentPassword, newPassword]
              properties:
                currentPassword: { type: string }
                newPassword: { type: string, minLength: 12 }
      responses:
        200:
          description: Contraseña actualizada y mustChangePassword desactivado

  /api/auth/verify-phone-request:
    post:
      summary: Solicita envío de código OTP de 6 dígitos por WhatsApp (Rate limited a 1 req/60s)
      responses:
        200:
          description: Código encolado para despacho
        429:
          description: Solicitud en enfriamiento. Espere 60 segundos.

  /api/auth/verify-phone-confirm:
    post:
      summary: Valida el código OTP y activa isPhoneVerified (Protegido por rate limit)
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [code]
              properties:
                code: { type: string, example: "492810" }
      responses:
        200:
          description: Teléfono verificado exitosamente
        400:
          description: Código incorrecto
        429:
          description: Demasiados intentos fallidos. Bloqueado temporalmente por 15 minutos.

  /api/packages:
    get:
      summary: Lista paquetes paginados del usuario autenticado
      parameters:
        - in: query
          name: page
          schema: { type: integer, default: 1 }
        - in: query
          name: limit
          schema: { type: integer, default: 20, maximum: 100 }
      responses:
        200:
          description: Colección paginada de envíos
    post:
      summary: Registra un nuevo paquete (clasificación estricta JP o CL)
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [title, trackingNumber]
              properties:
                title: { type: string }
                trackingNumber: { type: string, example: "EJ123456789JP" }
      responses:
        201:
          description: Paquete creado y encolado
        422:
          description: Guía no corresponde a Japan Post ni a Correos de Chile

  /api/packages/{id}:
    patch:
      summary: Actualiza preferencias de notificación del paquete
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [notificationsEnabled]
              properties:
                notificationsEnabled: { type: boolean }
      responses:
        200:
          description: Preferencia actualizada exitosamente

  /api/packages/{id}/update:
    put:
      summary: Solicita actualización manual (encola job asíncrono)
      responses:
        202:
          description: Petición encolada

  /api/packages/update-all:
    post:
      summary: Encola la sincronización masiva de todos los paquetes pendientes del usuario
      responses:
        202:
          description: Tareas encoladas en lotes

  /api/whatsapp/qr-ticket:
    post:
      summary: Genera ticket efímero de un solo uso para SSE (Solo Admin)
      responses:
        200:
          content:
            application/json:
              schema:
                properties:
                  ticket: { type: string }

  /api/whatsapp/qr-stream:
    get:
      summary: Flujo SSE del código QR (requiere ?ticket=)
      parameters:
        - in: query
          name: ticket
          required: true
          schema: { type: string }

```

---

### 5.2. Diagrama de Secuencia Corregido

```mermaid
sequenceDiagram
    autonumber
    participant Cron as BullMQ Repeatable Job
    participant DB as MongoDB
    participant Q_JP as queue_japanpost
    participant Q_CL as queue_correoscl
    participant Worker as TrackingWorker
    participant Redis as Redis (CB & State)
    participant Scraper as ScraperService
    participant Aggregator as Agregador (Fallback)
    participant NotifQ as notificationQueue

    Cron->>DB: Consultar paquetes pendientes (status != DELIVERED)
    DB-->>Cron: Lista de paquetes
    loop Para cada paquete
        alt trackingNumber termina en 'JP' (Internacional)
            Cron->>Q_JP: Encolar Job { packageId, carrier: 'japanpost' }
            Cron->>Q_CL: Encolar Job { packageId, carrier: 'correos_chile' }
        else trackingNumber es Nacional (*CL o 12 dígitos)
            Cron->>Q_CL: Encolar Job { packageId, carrier: 'correos_chile' }
        end
    end

    Note over Worker: Worker procesa Job respetando el limiter de su dominio
    Worker->>Redis: GET circuit:<carrier>:state
    
    alt circuit == OPEN
        Worker->>Redis: EXISTS circuit:<carrier>:cooldown
        alt Cooldown Activo
            Worker->>Aggregator: Desviar directo a Agregador API
            Aggregator-->>Worker: Resultado Normalizado
        else Cooldown Expirado
            Worker->>Redis: SET circuit:<carrier>:probe "locked" NX EX 30
            alt Candado Adquirido
                Worker->>Redis: SET state = HALF_OPEN
                Worker->>Scraper: Ejecutar Sonda Local
            else Candado No Adquirido
                Worker->>Aggregator: Desviar a Agregador API
                Aggregator-->>Worker: Resultado Normalizado
            end
        end
    else circuit == HALF_OPEN
        Worker->>Redis: EXISTS circuit:<carrier>:probe
        alt Sonda Expirada (Worker previo caído)
            Worker->>Redis: SET state = OPEN, cooldown = active (300s)
            Worker->>Aggregator: Desviar a Agregador API
        else Sonda en Curso Activo
            Worker->>Aggregator: Desviar a Agregador API
        end
    else circuit == CLOSED
        Worker->>Scraper: Ejecutar Scraping Local
        alt Fallo Estructural o 5xx (No 404 de Correos Chile)
            Scraper-->>Worker: Error / ScraperStructureException
            Worker->>Redis: recordFailure() (INCR y fija cooldown si >= 5 o en HALF_OPEN)
            Worker->>Aggregator: Fallback a Agregador API
            Aggregator-->>Worker: Resultado Normalizado
        else Extracción Exitosa
            Scraper-->>Worker: Eventos extraídos y candidateStatus
            Worker->>Redis: recordSuccess() (CLOSED, del failures/probe/cooldown)
        end
    end

    Note over Worker: Deduplicación e Inserción de Eventos (Siempre Ocurre)
    Worker->>DB: findById(pkgId, "status history.rawChecksum notificationsEnabled lastNotifiedAt userId").populate("userId", "isPhoneVerified phone")
    DB-->>Worker: Documento de Paquete con estado, flags y usuario poblado
    Worker->>Worker: Filtrar eventos nuevos mediante Set(history.rawChecksum)
    opt uniqueEvents.length > 0
        Worker->>DB: updateOne({ _id: pkgId }, { $push: { history: { $each: uniqueEvents } } })
    end

    Note over Worker: Evaluación Monótona y Mutación de Estado
    Worker->>Worker: canTransition(currentStatus, candidateStatus)

    alt canTransition == true
        Worker->>Worker: Computar shouldThrottle (now - lastNotifiedAt < 60s && candidate != DELIVERED)
        Worker->>DB: findOneAndUpdate({ _id: pkgId, status: currentStatus }, { $set: { status: candidateStatus, lastChecked: now } })
        
        alt Actualización Exitosa (Sin colisión)
            opt isNotifiable(candidateStatus) y notificationsEnabled == true y userId.isPhoneVerified == true y !shouldThrottle
                Worker->>NotifQ: Encolar alerta (jobId: notif:pkgId:candidateStatus, removeOnComplete: 1h)
                Worker->>DB: updateOne({ _id: pkgId }, { $set: { lastNotifiedAt: now } })
            end
        else Colisión Concurrente (Worker paralelo actualizó el status)
            Worker->>DB: findById(pkgId, "status lastNotifiedAt")
            DB-->>Worker: { nuevoStatusPersistido, nuevoLastNotifiedAt }
            Worker->>Worker: canTransition(nuevoStatusPersistido, candidateStatus)
            alt Sigue siendo avance válido
                Worker->>Worker: Recomputar shouldThrottle con nuevoLastNotifiedAt
                Worker->>DB: findOneAndUpdate({ _id: pkgId, status: nuevoStatusPersistido }, { $set: { status: candidateStatus, lastChecked: now } })
                opt Actualización Exitosa y isNotifiable y !shouldThrottle
                    Worker->>NotifQ: Encolar alerta (jobId: notif:pkgId:candidateStatus, removeOnComplete: 1h)
                    Worker->>DB: updateOne({ _id: pkgId }, { $set: { lastNotifiedAt: now } })
                end
            else Estado persistido es igual o superior
                Worker->>Worker: Descartar mutación de estado obsoleta de forma segura
            end
        end
    else canTransition == false
        Worker->>DB: updateOne({ _id: pkgId }, { $set: { lastChecked: now } })
    end

```

---

### 5.3. Diagrama de Clases del Sistema Completo

```mermaid
classDiagram
    direction TB

    %% Controladores API
    class AuthController {
        +register(req, res) Promise
        +login(req, res) Promise
        +logout(req, res) Promise
        +changePassword(req, res) Promise
        +requestPhoneVerification(req, res) Promise
        +confirmPhoneVerification(req, res) Promise
    }

    class PackageController {
        -queueManager: QueueManager
        -carrierDetector: CarrierDetector
        +getAll(req, res) Promise
        +create(req, res) Promise
        +toggleNotifications(req, res) Promise
        +updateSingle(req, res) Promise
        +updateAll(req, res) Promise
    }

    class WhatsAppController {
        -redis: Redis
        +generateQRTicket(req, res) Promise
        +streamQR(req, res) void
    }

    %% Gestores de Colas y Workers
    class QueueManager {
        -jpQueue: Queue
        -clQueue: Queue
        -notifQueue: Queue
        +enqueueTracking(packageDoc: Package) Promise
        +enqueueNotification(payload: Object) Promise
    }

    class TrackingWorker {
        -jpWorker: Worker
        -clWorker: Worker
        -scraperService: ScraperService
        -circuitBreaker: CircuitBreaker
        -queueManager: QueueManager
        +processJob(job: Object) Promise
        -deduplicateAndPushHistory(pkgId: ObjectId, events: TrackingEvent[]) Promise
        -transitionAndNotifyWithRetry(pkgId: ObjectId, current: String, candidate: String) Promise
    }

    %% Servicios de Dominio
    class CarrierDetector {
        +detectCarrier(trackingNumber: String) String
    }

    class StatusManager {
        +canTransition(current: String, candidate: String) Boolean
        +isNotifiable(status: String) Boolean
    }

    class CircuitBreaker {
        -redis: Redis
        +canExecute(carrier: String) Promise~Boolean~
        +recordSuccess(carrier: String) Promise~void~
        +recordFailure(carrier: String) Promise~void~
    }

    class ScraperService {
        -japanPostTracker: JapanPostTracker
        -correosChileTracker: CorreosChileTracker
        -aggregatorTracker: AggregatorFallbackTracker
        -circuitBreaker: CircuitBreaker
        +track(carrier: String, trackingNumber: String) Promise~TrackingResult~
    }

    %% Adaptadores de Courier
    class CarrierTracker {
        <<interface>>
        +fetchTracking(trackingNumber: String) Promise~TrackingResult~
        +validateDom(cheerioInstance: Object) void
    }

    class JapanPostTracker {
        +fetchTracking(trackingNumber: String) Promise~TrackingResult~
        +validateDom(cheerioInstance: Object) void
        +parseHtml(html: String, trackingNumber: String) TrackingResult
    }

    class CorreosChileTracker {
        +fetchTracking(trackingNumber: String) Promise~TrackingResult~
        +validateDom(payload: Object) void
    }

    class AggregatorFallbackTracker {
        -apiKey: String
        +fetchTracking(trackingNumber: String) Promise~TrackingResult~
    }

    %% Daemon de WhatsApp
    class WhatsAppServiceDaemon {
        -notificationWorker: Worker
        -baileysClient: BaileysClient
        -callMeBotClient: CallMeBotClient
        -redisPubSub: Redis
        +startConsumer() void
        +handleNotificationJob(payload: Object) Promise
    }

    class WhatsAppProvider {
        <<interface>>
        +sendMessage(to: String, text: String) Promise~Boolean~
        +isAvailable() Boolean
    }

    class BaileysClient {
        -sock: Socket
        +sendMessage(to: String, text: String) Promise~Boolean~
        +isAvailable() Boolean
        -setupSocket() void
    }

    class CallMeBotClient {
        -apiKey: String
        -adminPhone: String
        +sendMessage(to: String, text: String) Promise~Boolean~
        +isAvailable() Boolean
    }

    %% Modelos Mongoose
    class User {
        +ObjectId id
        +String email
        +String passwordHash
        +String phone
        +Boolean isPhoneVerified
        +Boolean mustChangePassword
        +String role
    }

    class Package {
        +ObjectId id
        +ObjectId userId
        +String title
        +String trackingNumber
        +String carrier
        +String status
        +Date lastChecked
        +Date lastNotifiedAt
        +Boolean notificationsEnabled
        +TrackingEvent[] history
    }

    class TrackingEvent {
        +Date date
        +String rawStatus
        +String canonicalStatus
        +String location
        +String sourceCarrier
        +String rawChecksum
    }

    %% Relaciones
    PackageController --> QueueManager : Encola jobs
    PackageController --> CarrierDetector : Valida
    PackageController ..> Package : Mutación
    AuthController --> User : Persistencia

    QueueManager ..> TrackingWorker : Despacha por colas
    TrackingWorker --> CircuitBreaker : Evalúa estado
    TrackingWorker --> ScraperService : Extrae datos
    TrackingWorker --> StatusManager : Evalúa canTransition
    TrackingWorker ..> Package : Merge atómico y reconciliación

    ScraperService --> CircuitBreaker : Reporta éxito/fallo
    ScraperService --> JapanPostTracker : Scraping JP
    ScraperService --> CorreosChileTracker : Scraping CL
    ScraperService --> AggregatorFallbackTracker : Fallback si OPEN

    JapanPostTracker ..|> CarrierTracker : Implementa
    CorreosChileTracker ..|> CarrierTracker : Implementa

    TrackingWorker --> QueueManager : Encola a notifQueue
    QueueManager ..> WhatsAppServiceDaemon : Procesa alertas con rate limit
    WhatsAppServiceDaemon --> WhatsAppProvider : Envía
    BaileysClient ..|> WhatsAppProvider : Implementa
    CallMeBotClient ..|> WhatsAppProvider : Fallback Admin

    Package *-- TrackingEvent : Contiene historial
    User "1" <-- "*" Package : Es propietario de

```

---

## 6. Plan de Entrega y Alcance del MVP

### 6.1. Definición del Alcance del MVP (Alcance Cerrado)

* **Couriers Integrados:** Exclusivamente **Japan Post** y **Correos de Chile**. Cualquier otra guía se rechaza en la capa de entrada con HTTP 422.
* **Destino y Entorno de Despliegue:** Despliegue contenerizado sobre servidor VPS Debian/Ubuntu con Docker Compose, exponiendo el frontend compilado en Nginx tras un reverse proxy TLS (Traefik/Cloudflare).
* **Respaldos:** Automatización de respaldos diarios de `mongo-data` y respaldo de contingencia de las credenciales de `baileys-session`.

### 6.2. Fases de Entrega

* **Fase 1: MVP Core Operativo y Pipeline CI/CD (Entregable Base):**
* Pipeline de GitHub Actions configurado desde el primer commit con tests unitarios y de integración mediante fixtures estáticos de Japan Post y Correos de Chile.
* Modelos `User` (con `mustChangePassword`) y `Package` (con `lastNotifiedAt` y sin `estimatedDelivery`) con enums estrictos e índices compuestos en MongoDB con autenticación.
* Middleware global `requirePasswordChange` para control de rotación obligatoria de credenciales de administrador (permitiendo solo cambio de clave y logout).
* Módulo de clasificación estricta `carrierDetector.js` (validación de 12 dígitos no telefónicos) y controlador REST paginado (`page`, `limit`).
* Endpoint `PATCH /api/packages/:id` para alternar `notificationsEnabled`.
* Scrapers nativos para Japan Post (Cheerio) y Correos de Chile (HTTP API).
* Colas BullMQ segregadas (`queue_japanpost`, `queue_correoscl`) y rate limits declarados en sus respectivos `Worker`.
* Fusión incondicional de eventos mediante pre-filtrado por checksum normalizado en memoria de aplicación y `$push` en MongoDB, con evaluación monótona de transiciones (`canTransition` con caso aduanero y salida de excepción) bajo bloqueo optimista (`findOneAndUpdate` con reintento único de conciliación).
* Frontend en React 18 + Vite con vista de dashboard paginada, formulario de ingreso, línea de tiempo unificada y autenticación JWT (HS256).


* **Fase 2: Canal WhatsApp, Verificación OTP y Resiliencia:**
* Contenedor singleton `whatsapp_service` ejecutando Baileys con persistencia en volumen `baileys-session` y limitador en `notificationWorker` (20 msgs / 60s con jitter de $3000\text{ ms} \pm 500\text{ ms}$).
* Flujo de verificación de teléfonos de usuarios mediante código OTP de 6 dígitos con protección integral: cooldown de solicitud de 60 s (`otp_cooldown:<userId>`) y límite de 5 intentos fallidos (`otp_attempts:<userId>`).
* Streaming seguro del código QR vía SSE autenticado mediante tickets de un solo uso consumidos con `GETDEL` en Redis (TTL 60 s, solo Admin).
* Manejo de reconexiones limpias en Baileys invocando `sock.ev.removeAllListeners()` previo a reconectar.
* Despacho selectivo de notificaciones ante estados `CUSTOMS_HOLD`, `OUT_FOR_DELIVERY`, `DELIVERED` y `EXCEPTION` con debounce consistente por reconciliación (60 s), deduplicación acotada con retención finita de 1 hora en BullMQ (`removeOnComplete: { age: 3600 }`), actualización de `lastNotifiedAt` posterior al encolado exitoso y fallback a CallMeBot para el número del administrador, respetando `pkg.notificationsEnabled === true`.


* **Fase 3: Circuit Breakers, Fallback Externo y Observabilidad:**
* Activación del Circuit Breaker centralizado en Redis con sondeo atómico mediante `SET NX` en `HALF_OPEN`, respeto estricto del periodo de enfriamiento (`cooldown`) y recuperación automática ante sondas huérfanas expiradas.
* Integración del adaptador `AggregatorFallbackTracker` (17TRACK/Ship24) como plan de contingencia ante circuitos en estado `OPEN`.
* Panel administrativo de monitoreo de colas mediante `@bull-board/express` protegido con middleware de rol `admin`.
* Automatización de scripts de snapshot y respaldo para MongoDB y credenciales de Baileys.