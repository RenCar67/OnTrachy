/**
 * @typedef {Object} TrackingEvent
 * @property {Date} date
 * @property {string} rawStatus
 * @property {('PRE_TRANSIT'|'IN_TRANSIT'|'CUSTOMS_HOLD'|'OUT_FOR_DELIVERY'|'DELIVERED'|'EXCEPTION')} canonicalStatus
 * @property {string} location
 * @property {string} details
 * @property {('japanpost'|'correos_chile'|'aggregator')} sourceCarrier
 * @property {string} rawChecksum
 */

/**
 * @typedef {Object} TrackingResult
 * @property {('PRE_TRANSIT'|'IN_TRANSIT'|'CUSTOMS_HOLD'|'OUT_FOR_DELIVERY'|'DELIVERED'|'EXCEPTION')} status
 * @property {TrackingEvent[]} events
 * @property {Date|null} estimatedDelivery
 */

export class CarrierTracker {
  /**
   * @param {string} trackingNumber
   * @returns {Promise<TrackingResult>}
   */
  async fetchTracking(trackingNumber) {
    throw new Error('Método fetchTracking() no implementado');
  }
}
