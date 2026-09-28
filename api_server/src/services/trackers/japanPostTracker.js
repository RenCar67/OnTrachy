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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
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
    const table = $('table.tableType01');

    if (table.length === 0) {
      throw new ScraperStructureException(
        `Estructura DOM no reconocida o bloqueo WAF en Japan Post para guía: ${trackingNumber}`
      );
    }

    const events = [];
    table.last().find('tr').slice(1).each((_, row) => {
      const cols = $(row).find('td');
      if (cols.length >= 3) {
        const dateStr = $(cols[0]).text().trim();
        const rawStatus = $(cols[1]).text().trim();
        const details = $(cols[2]).text().trim();
        const location = cols.length >= 4 ? $(cols[3]).text().trim() : 'Japan';

        if (dateStr && rawStatus) {
          const date = new Date(dateStr);
          const canonicalStatus = this.mapStatus(rawStatus);

          events.push({
            date,
            rawStatus,
            canonicalStatus,
            location: location || 'Japan',
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

  mapStatus(rawStatus) {
    const s = (rawStatus || '').toLowerCase();
    if (s.includes('final delivery') || s.includes('delivery completed')) return 'DELIVERED';
    if (s.includes('out for delivery')) return 'OUT_FOR_DELIVERY';
    if (s.includes('customs')) return 'CUSTOMS_HOLD';
    if (s.includes('dispatch') || s.includes('arrival') || s.includes('departure')) return 'IN_TRANSIT';
    if (s.includes('posting') || s.includes('collection')) return 'PRE_TRANSIT';
    if (s.includes('retention') || s.includes('failed')) return 'EXCEPTION';
    return 'IN_TRANSIT';
  }
}
