# INTEGRATION.md — Frontend Redesign (Hito 1 → Diseño Prototipo Replit)

## ¿Qué cambió?

### Stack
- **Sin cambios en dependencias**: se mantienen `react`, `react-dom`, `axios`, `lucide-react`, `vite`, `@vitejs/plugin-react`. No se agregó Tailwind (el prototipo usa CSS Modules con variables CSS, no utility classes).
- **CSS Modules**: migración de `dashboard.module.css` → 5 archivos `.module.css` que replican el diseño del prototipo Replit pixel por pixel.
- **Design Tokens**: `src/index.css` define el sistema de colores, tipografía (Inter + Space Mono), y animaciones globales.

### Archivos nuevos
```
client/src/
├── index.css                              ← Design tokens + global styles
├── App.jsx                                ← Rediseñado: shell sidebar + main column
├── main.jsx                               ← Importa index.css
├── components/
│   ├── EmptyState.jsx                     ← NUEVO: estado vacío reutilizable
│   ├── PackageCard.jsx                    ← NUEVO: contenedor summary + timeline
│   ├── PackageSummary.jsx                 ← NUEVO: resumen con save/refresh/copy
│   ├── Sidebar.jsx                        ← NUEVO: barra lateral con envíos guardados
│   ├── Timeline.jsx                       ← Rediseñado con skeleton + es-CL dates
│   ├── TrackingSearch.jsx                 ← Rediseñado con carrier detection badge
│   └── Modals/.gitkeep                   ← Placeholder para Fase 2
├── hooks/
│   ├── usePackages.js                     ← NUEVO: orquestador de estado
│   └── useSavedPackages.js               ← NUEVO: persistencia localStorage
├── services/
│   ├── api.js                             ← Mejorado: normalizePackage + error messages
│   └── sseService.js                      ← Placeholder para Fase 3
└── styles/
    ├── App.module.css                     ← Layout principal
    ├── PackageCard.module.css             ← Card con empty/loading states
    ├── PackageSummary.module.css          ← Resumen del envío
    ├── Sidebar.module.css                 ← Sidebar + mobile drawer
    └── Timeline.module.css                ← Timeline vertical con markers
```

### Archivos eliminados
- `src/styles/dashboard.module.css`

### Archivos que NO se tocaron
- `Dockerfile` — sin cambios
- `package.json` — sin cambios (no se agregaron dependencias)
- `docker-compose.yml` — sin cambios
- `api_server/` — intacto

## Pasos para integrar

### Si estás usando Docker (producción):
```bash
docker compose build client
docker compose up -d client
```

### Si estás corriendo dev local (sin Docker):
```bash
cd client
npm install
npm run dev
```

## Verificación

### 1. Japan Post (camino feliz)
1. Abrí http://localhost:3000
2. Ingresá LX332925500JP → badge verde "Japan Post" aparece
3. Clic en "Consultar" → card de resumen + timeline con "Posting/Collection" en KODAIRA, TOKYO
4. Clic en "Guardar" → aparece input de título → escribí un nombre → "Guardar"
5. Verificá que aparece en la sidebar izquierda

### 2. Correos de Chile (WAF 503)
1. Ingresá CP123456789CL → badge "Correos de Chile"
2. Clic en "Consultar" → error rojo: "El courier no está disponible en este momento"

### 3. Guía inválida (422)
1. Ingresá INVALID → sin badge, botón deshabilitado
2. Si forzás formato válido tipo INVALID12JP → "La guía no tiene un formato válido"

### 4. LocalStorage
1. Guardá un envío, recargá la página (F5)
2. El envío debe seguir en la sidebar
3. DevTools → Application → Local Storage → packagemate.savedPackages

## Features de diseño
- Dark theme con fondo #0a0e1a y superficies #131826
- Sistema de acentos verde (#22c55e / #39dc77)
- Tipografía dual: Inter (UI) + Space Mono (tracking numbers, timestamps)
- Responsive: sidebar se convierte en drawer a ≤720px
- Animaciones: shimmer skeleton, marker halo pulse, rise-in entrance
- Copy-to-clipboard en número de guía
