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

- **Correos de Chile (WAF Anti-Bot & reCAPTCHA v3):**
  Correos de Chile no dispone de una API REST pública oficial y su portal web de seguimiento (`correos.cl/seguimiento-en-linea`) se encuentra protegido por **ShieldSquare / Radware Bot Manager (`perfdrive.com`)** junto a **Google reCAPTCHA v3 / hCaptcha**. Las peticiones HTTP automatizadas directas son bloqueadas por el WAF y el sistema arroja `TrackerBlockedException` (HTTP 503). La resolución definitiva de esta limitación está planificada para la **Fase 3** mediante el adaptador de agregador externo (**17TRACK / Ship24**), tal como lo establece la especificación técnica en `OnTrachy.md`.

