import mongoose from 'mongoose';
import crypto from 'node:crypto';

/**
 * Genera un hash MD5 normalizado para la deduplicación intra-carrier de eventos.
 * 
 * NOTA DE DISEÑO (Intra-Carrier Deduplication & Audit Trail):
 * Se incluye 'sourceCarrier' deliberadamente en la cadena del hash.
 * Al incluir 'sourceCarrier', se garantiza idempotencia estricta para cada operador
 * sin falsos positivos ni pérdida de eventos consecutivos del mismo courier.
 */
export function generateEventChecksum(sourceCarrier, date, rawStatus, location) {
  const normCarrier = (sourceCarrier || '').trim().toLowerCase();
  const normDate = date instanceof Date ? date.toISOString() : new Date(date).toISOString();
  const normStatus = (rawStatus || '').trim().toLowerCase();
  const normLoc = (location || '').trim().toLowerCase();
  return crypto
    .createHash('md5')
    .update(`${normCarrier}|${normDate}|${normStatus}|${normLoc}`)
    .digest('hex');
}

const TrackingEventSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  rawStatus: { type: String, required: true },
  canonicalStatus: { 
    type: String, 
    enum: ['PRE_TRANSIT', 'IN_TRANSIT', 'CUSTOMS_HOLD', 'OUT_FOR_DELIVERY', 'DELIVERED', 'EXCEPTION'],
    required: true 
  },
  location: { type: String, default: 'Desconocido' },
  details: { type: String, default: '' },
  sourceCarrier: { 
    type: String, 
    enum: ['japanpost', 'correos_chile', 'aggregator'], 
    required: true 
  },
  rawChecksum: { type: String, required: true }
}, { _id: false });

const PackageSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: false, // TODO(Fase 2): Endurecer a true cuando se integre autenticación
    default: null,
    index: true 
  },
  title: { type: String, required: true, trim: true },
  trackingNumber: { type: String, required: true, uppercase: true, trim: true },
  carrier: { 
    type: String, 
    enum: ['japanpost', 'correos_chile'], 
    required: true,
    index: true
  },
  status: { 
    type: String, 
    enum: ['PRE_TRANSIT', 'IN_TRANSIT', 'CUSTOMS_HOLD', 'OUT_FOR_DELIVERY', 'DELIVERED', 'EXCEPTION'], 
    default: 'PRE_TRANSIT', 
    index: true 
  },
  estimatedDelivery: { type: Date, default: null },
  lastChecked: { type: Date, default: Date.now },
  lastNotifiedAt: { type: Date, default: null },
  notificationsEnabled: { type: Boolean, default: true },
  history: [TrackingEventSchema]
}, { timestamps: true });

PackageSchema.index({ trackingNumber: 1 });
PackageSchema.index({ userId: 1, trackingNumber: 1 }, { unique: true });

export default mongoose.model('Package', PackageSchema);
