import React from 'react';
import { Package, MapPin, Clock } from 'lucide-react';
import styles from '../styles/dashboard.module.css';

const STATUS_LABELS = {
  PRE_TRANSIT: 'Pre-tránsito',
  IN_TRANSIT: 'En tránsito',
  CUSTOMS_HOLD: 'Retención aduanera',
  OUT_FOR_DELIVERY: 'En reparto',
  DELIVERED: 'Entregado',
  EXCEPTION: 'Excepción'
};

const STATUS_CLASSES = {
  PRE_TRANSIT: styles.statusPreTransit,
  IN_TRANSIT: styles.statusInTransit,
  CUSTOMS_HOLD: styles.statusCustomsHold,
  OUT_FOR_DELIVERY: styles.statusOutForDelivery,
  DELIVERED: styles.statusDelivered,
  EXCEPTION: styles.statusException
};

const CARRIER_LABELS = {
  japanpost: 'Japan Post',
  correos_chile: 'Correos Chile'
};

export function PackageSummary({ pkg }) {
  if (!pkg) return null;

  const lastEvent = pkg.history && pkg.history.length > 0
    ? pkg.history[pkg.history.length - 1]
    : null;

  return (
    <div className={styles.summaryCard}>
      <div className={styles.summaryHeader}>
        <div>
          <div className={styles.summaryTitle}>
            <Package size={16} style={{ marginRight: '0.4rem', verticalAlign: 'text-bottom' }} />
            {pkg.title}
          </div>
          <div className={styles.summaryTracking}>{pkg.trackingNumber}</div>
        </div>
        <span className={`${styles.statusBadge} ${STATUS_CLASSES[pkg.status] || styles.statusPreTransit}`}>
          {STATUS_LABELS[pkg.status] || pkg.status}
        </span>
      </div>
      <div className={styles.summaryMeta}>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Carrier</span>
          <span className={styles.metaValue}>
            {CARRIER_LABELS[pkg.carrier] || pkg.carrier}
          </span>
        </div>
        {lastEvent && (
          <>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Última ubicación</span>
              <span className={styles.metaValue}>
                <MapPin size={12} style={{ marginRight: '0.25rem', verticalAlign: 'text-bottom' }} />
                {lastEvent.location}
              </span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Última actualización</span>
              <span className={styles.metaValue}>
                <Clock size={12} style={{ marginRight: '0.25rem', verticalAlign: 'text-bottom' }} />
                {new Date(lastEvent.date).toLocaleDateString('es-CL', {
                  year: 'numeric', month: 'short', day: 'numeric'
                })}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
