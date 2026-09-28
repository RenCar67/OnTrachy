# PackageMate — Hito 1

Sistema de seguimiento de envíos para **Japan Post** y **Correos de Chile**.

## Requisitos

- Docker & Docker Compose v2
- Node.js 22 LTS (solo para desarrollo local)

## Arranque rápido

```bash
# Clonar y configurar
cp .env.example .env
# Editar .env con credenciales seguras si es necesario

# Levantar todo
docker compose up --build

# Verificar
curl http://localhost:5000/health
# → {"status":"ok"}
```

**Frontend:** http://localhost:3000  
**API:** http://localhost:5000

## Desarrollo local (sin Docker)

```bash
# Backend
cd api_server
npm install
npm run dev

# Frontend (otra terminal)
cd client
npm install
npm run dev
```

Requiere MongoDB corriendo en `localhost:27017`. Configurar `MONGO_URI` en `api_server/.env`.

## Tests

```bash
cd api_server
npm test
```

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Healthcheck |
| POST | `/api/packages` | Registra guía y ejecuta scraping |
| GET | `/api/packages/:trackingNumber` | Consulta paquete existente |

## Stack

- **Backend:** Node.js 22, Express 4, Mongoose 8, Cheerio, Axios
- **Frontend:** React 18, Vite, Lucide Icons
- **Infra:** MongoDB 6, Docker, Nginx

## Limitaciones conocidas del Hito 1

- **Correos de Chile (WAF Anti-Bot, reCAPTCHA v3 & Ausencia de Camino Feliz Directo):**
  Correos de Chile no dispone de una API REST pública oficial. Su portal web de seguimiento (`correos.cl/seguimiento-en-linea`) se encuentra montado sobre una arquitectura Liferay protegida por **ShieldSquare / Radware Bot Manager (`perfdrive.com`)** y **Google reCAPTCHA v3 / hCaptcha**.
  
  En este Hito 1, el flujo completo de extracción por scraping directo (obtención dinámica de sesión/token Liferay `p_auth`, resolución de captcha en navegador, emisión del POST AJAX al portlet y parseo del payload JSON) **no está implementado ni resulta técnicamente viable mediante peticiones HTTP estándar sin emulación de navegador**. El tracker actual (`CorreosChileTracker`) detecta de forma fehaciente la firma del reto del WAF y falla honestamente arrojando `TrackerBlockedException` (HTTP 503), pero **no cuenta con un camino feliz directo en este hito**.

  El diseño aprobado en `OnTrachy.md` establece formalmente que la vía real y definitiva para dar soporte a Correos de Chile es a través del **adaptador de agregador externo (17TRACK / Ship24) en la Fase 3**, descartando el scraping directo frágil frente a contramedidas anti-bot.


