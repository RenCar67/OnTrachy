import { CarrierNotFoundException } from '../exceptions/CarrierNotFoundException.js';

const PATTERNS = {
  JAPAN_POST: /^[A-Z]{2}[0-9]{9}JP$/,
  CORREOS_CHILE_INT: /^[A-Z]{2}[0-9]{9}CL$/,
  CORREOS_CHILE_NAC: /^(?!569)[0-9]{12}$/
};

export function detectCarrier(trackingNumber) {
  if (!trackingNumber || typeof trackingNumber !== 'string') {
    throw new CarrierNotFoundException('Número de seguimiento no provisto o inválido');
  }

  const clean = trackingNumber.trim().toUpperCase();

  if (PATTERNS.JAPAN_POST.test(clean)) {
    return 'japanpost';
  }

  if (PATTERNS.CORREOS_CHILE_INT.test(clean) || PATTERNS.CORREOS_CHILE_NAC.test(clean)) {
    return 'correos_chile';
  }

  throw new CarrierNotFoundException(
    `La guía '${clean}' no corresponde a Japan Post (*JP) ni a Correos de Chile (*CL / 12 dígitos no telefónicos).`
  );
}
