import axios from 'axios';
import * as cheerio from 'cheerio';
import { CarrierTracker } from './carrierTracker.js';
import { TrackerBlockedException } from '../../exceptions/TrackerBlockedException.js';
import { generateEventChecksum } from '../../models/Package.js';

export class CorreosChileTracker extends CarrierTracker {
  constructor(timeoutMs = 5000) {
    super();
    this.client = axios.create({
      baseURL: process.env.CORREOS_URL || 'https://www.correos.cl',
      timeout: timeoutMs,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.correos.cl/seguimiento-en-linea',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
  }

  async fetchTracking(trackingNumber) {
    try {
      const response = await this.client.get('/seguimiento-en-linea', {
        params: {
          nroSeguimiento: trackingNumber
        }
      });

      return this.parseResponse(response.data, trackingNumber);
    } catch (error) {
      if (error instanceof TrackerBlockedException) {
        throw error;
      }

      // 404: bulto no registrado / no internado aún (comportamiento normal PRE_TRANSIT)
      if (error.response && error.response.status === 404) {
        return {
          status: 'PRE_TRANSIT',
          events: [],
          estimatedDelivery: null
        };
      }

      if (error.response?.status === 403 || error.response?.status === 429) {
        throw new TrackerBlockedException(
          `Consulta bloqueada por WAF de Correos de Chile (HTTP ${error.response.status}): Radware Bot Manager activo.`
        );
      }

      // Si la respuesta en error contiene el HTML del captcha
      if (typeof error.response?.data === 'string' && this.isWafBlocked(error.response.data)) {
        throw new TrackerBlockedException(
          'Consulta bloqueada por WAF de Correos de Chile: Radware Bot Manager / reCAPTCHA detectado en correos.cl.'
        );
      }

      throw error;
    }
  }

  isWafBlocked(html) {
    if (!html || typeof html !== 'string') return false;
    return (
      html.includes('captcha.perfdrive.com') ||
      html.includes('made us think that you are a bot') ||
      html.includes('h-captcha') ||
      html.includes('grecaptcha')
    );
  }

  parseResponse(data, trackingNumber) {
    // Si viene como JSON directo (API interna o simulador)
    if (typeof data === 'object' && data !== null) {
      const rawEvents = data.eventos || [];
      const events = rawEvents.map((ev) => {
        const date = new Date(`${ev.fecha} ${ev.hora || '00:00:00'}`);
        const rawStatus = ev.estado || 'En tránsito';
        const location = ev.centro || 'Chile';
        return {
          date,
          rawStatus,
          canonicalStatus: this.mapStatus(rawStatus),
          location,
          details: ev.descripcion || rawStatus,
          sourceCarrier: 'correos_chile',
          rawChecksum: generateEventChecksum('correos_chile', date, rawStatus, location)
        };
      });

      events.sort((a, b) => a.date - b.date);
      const latest = events[events.length - 1];
      return {
        status: latest ? latest.canonicalStatus : 'PRE_TRANSIT',
        events,
        estimatedDelivery: null
      };
    }

    // Si viene como HTML
    const html = String(data || '');

    if (this.isWafBlocked(html)) {
      throw new TrackerBlockedException(
        'Consulta bloqueada por WAF de Correos de Chile: Radware Bot Manager / reCAPTCHA detectado en correos.cl.'
      );
    }

    const $ = cheerio.load(html);
    const notFoundText = $('.envio_no_existe, .alertaRegistro, #segsNoEncontrados').text();
    if (notFoundText.includes('no existe') || notFoundText.includes('no encontrado')) {
      return {
        status: 'PRE_TRANSIT',
        events: [],
        estimatedDelivery: null
      };
    }

    const events = [];
    $('.table-tracking tbody tr, .timeline-item').each((_, el) => {
      const cols = $(el).find('td');
      if (cols.length >= 3) {
        const dateStr = $(cols[0]).text().trim();
        const rawStatus = $(cols[1]).text().trim();
        const location = $(cols[2]).text().trim();
        const date = new Date(dateStr);
        events.push({
          date,
          rawStatus,
          canonicalStatus: this.mapStatus(rawStatus),
          location: location || 'Chile',
          details: rawStatus,
          sourceCarrier: 'correos_chile',
          rawChecksum: generateEventChecksum('correos_chile', date, rawStatus, location)
        });
      }
    });

    events.sort((a, b) => a.date - b.date);
    const latest = events[events.length - 1];

    return {
      status: latest ? latest.canonicalStatus : 'PRE_TRANSIT',
      events,
      estimatedDelivery: null
    };
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
