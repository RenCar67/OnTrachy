import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CorreosChileTracker } from '../../src/services/trackers/correosChileTracker.js';
import { TrackerBlockedException } from '../../src/exceptions/TrackerBlockedException.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('CorreosChileTracker (Offline Fixtures & 404 Behavior)', () => {
  let tracker;

  beforeEach(() => {
    tracker = new CorreosChileTracker();
  });

  it('procesa eventos y mapea DELIVERED desde fixture JSON', async () => {
    const fixturePath = path.resolve(__dirname, '../fixtures/correos_delivered.json');
    const mockData = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

    vi.spyOn(tracker.client, 'get').mockResolvedValueOnce({ data: mockData });

    const result = await tracker.fetchTracking('CP123456789CL');

    expect(result.status).toBe('DELIVERED');
    expect(result.events.length).toBe(3);
    expect(result.events[0].sourceCarrier).toBe('correos_chile');
    expect(result.events[0].rawChecksum).toBeDefined();
    expect(result.events[2].canonicalStatus).toBe('DELIVERED');
  });

  it('retorna PRE_TRANSIT y eventos vacíos ante HTTP 404 (bulto no internado aún)', async () => {
    const notFoundError = new Error('Not Found');
    notFoundError.response = { status: 404 };

    vi.spyOn(tracker.client, 'get').mockRejectedValueOnce(notFoundError);

    const result = await tracker.fetchTracking('CP123456789CL');

    expect(result.status).toBe('PRE_TRANSIT');
    expect(result.events).toEqual([]);
    expect(result.estimatedDelivery).toBeNull();
  });

  it('arroja TrackerBlockedException ante ENOTFOUND o bloqueo WAF (403)', async () => {
    const blockError = new Error('getaddrinfo ENOTFOUND');
    blockError.code = 'ENOTFOUND';

    vi.spyOn(tracker.client, 'get').mockRejectedValueOnce(blockError);

    await expect(tracker.fetchTracking('CP123456789CL')).rejects.toThrow(TrackerBlockedException);
  });
});
