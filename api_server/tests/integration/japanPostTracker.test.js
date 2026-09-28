import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JapanPostTracker } from '../../src/services/trackers/japanPostTracker.js';
import { ScraperStructureException } from '../../src/exceptions/ScraperStructureException.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('JapanPostTracker (Offline Fixtures)', () => {
  let tracker;

  beforeEach(() => {
    tracker = new JapanPostTracker();
  });

  it('extrae el historial y mapea DELIVERED desde fixture estático', () => {
    const fixturePath = path.resolve(__dirname, '../fixtures/japanpost_delivered.html');
    const html = fs.readFileSync(fixturePath, 'utf8');

    const result = tracker.parseHtml(html, 'EJ123456789JP');

    expect(result.status).toBe('DELIVERED');
    expect(result.events.length).toBeGreaterThanOrEqual(1);
    expect(result.events[0].sourceCarrier).toBe('japanpost');
    expect(result.events[0].rawChecksum).toBeDefined();
  });

  it('arroja ScraperStructureException ante DOM corrupto o página de error', () => {
    const invalidHtml = '<html><body><h1>Under Maintenance</h1></body></html>';
    expect(() => tracker.parseHtml(invalidHtml, 'EJ123456789JP')).toThrow(ScraperStructureException);
  });
});
