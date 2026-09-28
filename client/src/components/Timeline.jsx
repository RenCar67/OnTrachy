import React from 'react';
import { MapPin } from 'lucide-react';
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

export function formatDate(value) {
  if (!value) return 'Fecha desconocida';
  const d = new Date(value);
  if (isNaN(d.getTime())) return 'Fecha desconocida';
  return d.toLocaleDateString('es-CL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function Timeline({ history }) {
  if (!history || history.length === 0) return null;

  // Cronológico descendente seguro contra fechas inválidas
  const sorted = [...history].sort((a, b) => {
    const timeA = new Date(a.date).getTime() || 0;
    const timeB = new Date(b.date).getTime() || 0;
    return timeB - timeA;
  });

  return (
    <div className={styles.timelineSection}>
      <h2 className={styles.timelineTitle}>Historial de eventos</h2>
      <div className={styles.timeline}>
        {sorted.map((event, idx) => (
          <div className={styles.timelineItem} key={event.rawChecksum || idx}>
            <div className={`${styles.timelineDot} ${idx === 0 ? styles.timelineDotActive : ''}`} />
            <div className={styles.timelineContent}>
              <div className={styles.timelineDate}>
                {formatDate(event.date)}
              </div>
              <div className={styles.timelineStatus}>{event.rawStatus}</div>
              <div className={styles.timelineLocation}>
                <MapPin size={11} />
                {event.location}
              </div>
              <div className={styles.timelineBadge}>
                <span className={`${styles.statusBadge} ${STATUS_CLASSES[event.canonicalStatus] || ''}`}>
                  {STATUS_LABELS[event.canonicalStatus] || event.canonicalStatus}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
