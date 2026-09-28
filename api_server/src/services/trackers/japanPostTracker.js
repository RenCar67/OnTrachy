import axios from 'axios';
import * as cheerio from 'cheerio';
import { CarrierTracker } from './carrierTracker.js';
import { ScraperStructureException } from '../../exceptions/ScraperStructureException.js';
import { generateEventChecksum } from '../../models/Package.js';

export class JapanPostTracker extends CarrierTracker {
  constructor(timeoutMs = 5000) {
    super();
    this.client = axios.create({
      baseURL: 'https://trackings.post.japanpost.jp/services/srv/search',
      timeout: timeoutMs,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
  }

  async fetchTracking(trackingNumber) {
    const { data: html } = await this.client.get('/direct', {
      params: {
        locale: 'en',
        reqCodeNo1: trackingNumber
      }
    });

    return this.parseHtml(html, trackingNumber);
  }

  parseHtml(html, trackingNumber) {
    const $ = cheerio.load(html);
    const allTables = $('table.tableType01');

    if (allTables.length === 0) {
      throw new ScraperStructureException(
        `Estructura DOM no reconocida o bloqueo WAF en Japan Post para guía: ${trackingNumber}`
      );
    }

    // Ubicar específicamente la tabla de historial (summary="履歴情報" o encabezado "Shipping track record")
    let historyTable = $('table[summary="履歴情報"]');
    if (!historyTable.length) {
      historyTable = allTables.filter((_, el) => $(el).attr('summary') === '履歴情報');
    }
    if (!historyTable.length) {
      historyTable = allTables.filter((_, el) => $(el).text().includes('Shipping track record'));
    }

    // Si no hay tabla de historial pero existe la tabla de resumen indicando "not found"
    if (!historyTable.length) {
      const summaryText = allTables.text();
      if (summaryText.includes('not found') || summaryText.includes('Confirm your item number')) {
        return {
          status: 'PRE_TRANSIT',
          events: [],
          estimatedDelivery: null
        };
      }
      // Si hay tablas tableType01 pero ninguna coincide con el patrón esperado
      return {
        status: 'PRE_TRANSIT',
        events: [],
        estimatedDelivery: null
      };
    }

    const events = [];
    historyTable.find('tr').each((_, row) => {
      const cols = $(row).find('td');
      // Las filas de eventos de tracking tienen al menos 3 celdas (Fecha, Estado, Detalles)
      if (cols.length >= 3) {
        const dateStr = $(cols[0]).text().trim();
        const rawStatus = $(cols[1]).text().trim();
        const details = $(cols[2]).text().trim();
        const office = cols.length >= 4 ? $(cols[3]).text().trim() : '';
        const prefecture = cols.length >= 5 ? $(cols[4]).text().trim() : '';
        const location = [office, prefecture].filter(Boolean).join(', ') || 'Japan';

        if (dateStr && rawStatus) {
          const date = this.parseDate(dateStr);
          if (!date || isNaN(date.getTime())) {
            return; // Descartar eventos con fecha no parseable
          }

          const canonicalStatus = this.mapStatus(rawStatus);

          events.push({
            date,
            rawStatus,
            canonicalStatus,
            location,
            details,
            sourceCarrier: 'japanpost',
            rawChecksum: generateEventChecksum('japanpost', date, rawStatus, location)
          });
        }
      }
    });

    events.sort((a, b) => a.date - b.date);

    const latestEvent = events[events.length - 1];
    const status = latestEvent ? latestEvent.canonicalStatus : 'PRE_TRANSIT';

    return {
      status,
      events,
      estimatedDelivery: null
    };
  }

  parseDate(dateStr) {
    if (!dateStr) return null;
    // Soporta formatos estándar de Japan Post: MM/DD/YYYY HH:mm o YYYY/MM/DD HH:mm
    const parts = dateStr.match(/^(\d{1,4})[\/\-](\d{1,2})[\/\-](\d{1,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (parts) {
      let [_, p1, p2, p3, h, m, s] = parts;
      let YYYY, MM, DD;
      if (p1.length === 4) {
        // YYYY/MM/DD
        YYYY = p1;
        MM = p2.padStart(2, '0');
        DD = p3.padStart(2, '0');
      } else {
        // MM/DD/YYYY
        MM = p1.padStart(2, '0');
        DD = p2.padStart(2, '0');
        YYYY = p3;
      }
      const HH = h.padStart(2, '0');
      const mm = m.padStart(2, '0');
      const ss = (s || '00').padStart(2, '0');
      // Japan Post reporta en JST (UTC+9). Forzar el offset explícitamente.
      const d = new Date(`${YYYY}-${MM}-${DD}T${HH}:${mm}:${ss}+09:00`);
      if (!isNaN(d.getTime())) return d;
    }
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  }

  mapStatus(rawStatus) {
    const s = (rawStatus || '').toLowerCase();
    if (s.includes('final delivery') || s.includes('delivery completed') || s.includes('delivered')) return 'DELIVERED';
    if (s.includes('out for delivery') || s.includes('processing at delivery')) return 'OUT_FOR_DELIVERY';
    if (s.includes('customs') || s.includes('held by import customs')) return 'CUSTOMS_HOLD';
    if (s.includes('dispatch') || s.includes('arrival') || s.includes('departure')) return 'IN_TRANSIT';
    if (s.includes('posting') || s.includes('collection')) return 'PRE_TRANSIT';
    if (s.includes('retention') || s.includes('failed') || s.includes('missing')) return 'EXCEPTION';
    return 'IN_TRANSIT';
  }
}
