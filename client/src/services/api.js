import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  headers: { 'Content-Type': 'application/json' },
});

const statusLabels = {
  PRE_TRANSIT: 'Pre-tránsito',
  IN_TRANSIT: 'En tránsito',
  CUSTOMS_HOLD: 'Retenido en aduana',
  OUT_FOR_DELIVERY: 'En reparto',
  DELIVERED: 'Entregado',
  EXCEPTION: 'Incidencia',
};

function carrierLabel(carrier) {
  const normalized = carrier.toLowerCase();
  return normalized.includes('japan') ? 'Japan Post' : 'Correos de Chile';
}

function eventDate(event) {
  const value = event.timestamp ?? event.date;
  return typeof value === 'string' ? value : new Date().toISOString();
}

function normalizePackage(raw) {
  const history = (raw.history ?? []).map((event) => {
    const canonicalStatus = typeof event.canonicalStatus === 'string' ? event.canonicalStatus : undefined;
    const rawStatus = typeof event.rawStatus === 'string' ? event.rawStatus : undefined;
    const status =
      typeof event.status === 'string'
        ? event.status
        : canonicalStatus
          ? statusLabels[canonicalStatus] ?? canonicalStatus
          : rawStatus ?? 'Actualización';

    return {
      status,
      canonicalStatus,
      rawStatus,
      location: typeof event.location === 'string' ? event.location : undefined,
      description:
        typeof event.description === 'string'
          ? event.description
          : typeof event.details === 'string'
            ? event.details
            : undefined,
      details: typeof event.details === 'string' ? event.details : undefined,
      sourceCarrier: typeof event.sourceCarrier === 'string' ? event.sourceCarrier : undefined,
      timestamp: eventDate(event),
      date: typeof event.date === 'string' ? event.date : undefined,
    };
  });

  history.sort((left, right) => {
    const leftTime = new Date(left.timestamp).getTime();
    const rightTime = new Date(right.timestamp).getTime();
    return rightTime - leftTime;
  });

  return {
    trackingNumber: raw.trackingNumber,
    title: raw.title,
    carrier: carrierLabel(raw.carrier),
    status: statusLabels[raw.status] ?? raw.status,
    history,
    lastChecked: raw.lastChecked,
  };
}

export async function trackPackage(trackingNumber, title) {
  const { data } = await api.post('/api/packages', {
    trackingNumber,
    ...(title?.trim() ? { title: title.trim() } : {}),
  });
  return normalizePackage(data);
}

export async function getPackage(trackingNumber) {
  const { data } = await api.get(`/api/packages/${encodeURIComponent(trackingNumber)}`);
  return normalizePackage(data);
}

export function getApiErrorMessage(error) {
  const status = error?.response?.status;
  if (status === 422) return 'El número de seguimiento no tiene un formato válido. Revisa los caracteres e inténtalo de nuevo.';
  if (status === 404) return 'No encontramos este envío todavía. Comprueba el número o vuelve a intentar más tarde.';
  if (status === 503) return 'El courier no está disponible en este momento. Reintenta en unos minutos.';
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'Sin conexión. Verifica tu red e inténtalo de nuevo.';
  return 'No pudimos consultar el envío. Inténtalo nuevamente.';
}

export default api;
