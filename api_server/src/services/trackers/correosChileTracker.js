import axios from 'axios';
import { CarrierTracker } from './carrierTracker.js';
import { TrackerBlockedException } from '../../exceptions/TrackerBlockedException.js';
import { generateEventChecksum } from '../../models/Package.js';

export class CorreosChileTracker extends CarrierTracker {
  constructor(timeoutMs = 5000) {
    super();
    this.client = axios.create({
      baseURL: process.env.CORREOS_API_URL || 'https://api.correos.cl/service-tracking/v1',
      timeout: timeoutMs,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.correos.cl/'
      }
    });
  }

  async fetchTracking(trackingNumber) {
    try {
      const { data } = await this.client.get(`/tracking/${trackingNumber}`);
      
      const rawEvents = data.eventos || [];
      const events = rawEvents.map((ev) => {
        const date = new Date(`${ev.fecha} ${ev.hora || '00:00:00'}`);
        const rawStatus = ev.estado || 'En tránsito';
        const location = ev.centro || 'Chile';
        const canonicalStatus = this.mapStatus(rawStatus);

        return {
          date,
          rawStatus,
          canonicalStatus,
          location,
          details: ev.descripcion || rawStatus,
          sourceCarrier: 'correos_chile',
          rawChecksum: generateEventChecksum('correos_chile', date, rawStatus, location)
        };
      });

      events.sort((a, b) => a.date - b.date);

      const latestEvent = events[events.length - 1];
      const status = latestEvent ? latestEvent.canonicalStatus : 'PRE_TRANSIT';

      return {
        status,
        events,
        estimatedDelivery: null
      };
    } catch (error) {
      // 404: bulto no internado o no registrado en planta CEN (comportamiento normal, no es error)
      if (error.response && error.response.status === 404) {
        return {
          status: 'PRE_TRANSIT',
          events: [],
          estimatedDelivery: null
        };
      }

      if (error.code === 'ENOTFOUND' || error.response?.status === 403 || error.response?.status === 429) {
        throw new TrackerBlockedException(
          `Consulta bloqueada hacia Correos de Chile (${error.code || error.response?.status}): WAF/reCAPTCHA activo o endpoint inaccesible.`
        );
      }

      throw error;
    }
  }

  mapStatus(rawStatus) {
    const s = (rawStatus || '').toLowerCase();
    if (s.includes('entregado') || s.includes('recepcionado en destino')) return 'DELIVERED';
    if (s.includes('reparto') || s.includes('cartero')) return 'OUT_FOR_DELIVERY';
    if (s.includes('internación') || s.includes('aduana') || s.includes('retenido')) return 'CUSTOMS_HOLD';
    if (s.includes('fallido') || s.includes('incompleta') || s.includes('rechazado')) return 'EXCEPTION';
    if (s.includes('planta') || s.includes('cen') || s.includes('tránsito')) return 'IN_TRANSIT';
    return 'PRE_TRANSIT';
  }
}
