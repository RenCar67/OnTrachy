export const STATE_WEIGHTS = {
  PRE_TRANSIT: 10,
  IN_TRANSIT: 20,
  CUSTOMS_HOLD: 25,
  OUT_FOR_DELIVERY: 40,
  DELIVERED: 50,
  EXCEPTION: 99
};

export const NOTIFIABLE_STATES = new Set([
  'CUSTOMS_HOLD',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'EXCEPTION'
]);

export function isNotifiable(status) {
  return NOTIFIABLE_STATES.has(status);
}

export function canTransition(current, candidate) {
  if (current === candidate || current === 'DELIVERED') return false;
  if (candidate === 'DELIVERED' || candidate === 'EXCEPTION') return true;
  if (current === 'EXCEPTION') return true;
  if (current === 'CUSTOMS_HOLD' && candidate === 'IN_TRANSIT') return true;
  if (current === 'IN_TRANSIT' && candidate === 'CUSTOMS_HOLD') return true;
  return (STATE_WEIGHTS[candidate] || 0) > (STATE_WEIGHTS[current] || 0);
}
