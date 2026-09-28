import Package from '../models/Package.js';
import { detectCarrier } from '../utils/carrierDetector.js';
import { canTransition } from '../utils/statusManager.js';
import { JapanPostTracker } from '../services/trackers/japanPostTracker.js';
import { CorreosChileTracker } from '../services/trackers/correosChileTracker.js';

const jpTracker = new JapanPostTracker(5000);
const clTracker = new CorreosChileTracker(5000);

export async function getPackageByTracking(req, res, next) {
  try {
    const trackingNumber = String(req.params.trackingNumber || '').trim().toUpperCase();

    // TODO(Fase 2): Restringir consulta -> { trackingNumber, userId: req.user.id }
    const pkg = await Package.findOne({ trackingNumber });

    if (!pkg) {
      return res.status(404).json({ error: 'Envío no encontrado en el sistema' });
    }

    return res.json(pkg);
  } catch (error) {
    next(error);
  }
}

export async function trackAndSavePackage(req, res, next) {
  try {
    const { trackingNumber, title } = req.body;
    const cleanNumber = String(trackingNumber || '').trim().toUpperCase();
    const carrier = detectCarrier(cleanNumber);

    let trackingResult;
    if (carrier === 'japanpost') {
      trackingResult = await jpTracker.fetchTracking(cleanNumber);
    } else {
      trackingResult = await clTracker.fetchTracking(cleanNumber);
    }

    const trimmedTitle = title?.trim();
    const fallbackTitle = `${carrier === 'japanpost' ? 'Japan Post' : 'Correos Chile'} - ${cleanNumber}`;
    const packageTitle = trimmedTitle || fallbackTitle;

    // TODO(Fase 2): Buscar con userId -> { trackingNumber: cleanNumber, userId: req.user.id }
    let pkg = await Package.findOne({ trackingNumber: cleanNumber });

    if (!pkg) {
      try {
        pkg = await Package.create({
          title: packageTitle,
          trackingNumber: cleanNumber,
          carrier,
          status: trackingResult.status,
          history: trackingResult.events,
          estimatedDelivery: trackingResult.estimatedDelivery || null,
          lastChecked: new Date()
        });
        return res.status(201).json(pkg);
      } catch (err) {
        if (err.code === 11000) {
          // Race condition: otro request creó el paquete simultáneamente
          pkg = await Package.findOne({ trackingNumber: cleanNumber });
          if (!pkg) throw err;
        } else {
          throw err;
        }
      }
    }

    if (trimmedTitle) {
      pkg.title = trimmedTitle;
    }

    const seenChecksums = new Set(pkg.history.map((e) => e.rawChecksum));
    const newUniqueEvents = trackingResult.events.filter((e) => !seenChecksums.has(e.rawChecksum));

    if (newUniqueEvents.length > 0) {
      pkg.history.push(...newUniqueEvents);
    }

    if (canTransition(pkg.status, trackingResult.status)) {
      pkg.status = trackingResult.status;
    }

    pkg.lastChecked = new Date();
    await pkg.save();

    return res.status(200).json(pkg);
  } catch (error) {
    if (error.name === 'CarrierNotFoundException') {
      return res.status(422).json({ error: error.message });
    }
    if (error.name === 'TrackerBlockedException') {
      return res.status(503).json({ error: error.message });
    }
    if (error.name === 'ScraperStructureException') {
      return res.status(502).json({ error: error.message });
    }
    next(error);
  }
}
