import { Check, CircleAlert, MapPin, PackageCheck, Truck } from 'lucide-react';
import styles from '../styles/Timeline.module.css';

function iconFor(status) {
  const normalized = status.toLowerCase();
  if (normalized.includes('entreg')) return <PackageCheck size={14} />;
  if (normalized.includes('incid') || normalized.includes('problem')) return <CircleAlert size={14} />;
  if (normalized.includes('tráns') || normalized.includes('trans') || normalized.includes('envia')) return <Truck size={14} />;
  return <Check size={14} />;
}

function formatEventDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: value, time: '' };
  return {
    date: new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }).format(date),
    time: new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit' }).format(date),
  };
}

export function Timeline({ events }) {
  if (!events.length) {
    return <div className={styles.emptyTimeline}>Este courier todavía no ha publicado movimientos para este envío.</div>;
  }

  return (
    <div className={styles.timeline} data-testid="timeline-events">
      {events.map((event, index) => {
        const latest = index === 0;
        const formatted = formatEventDate(event.timestamp);
        return (
          <div className={`${styles.event} ${latest ? styles.latest : ''}`} key={`${event.timestamp}-${event.status}-${index}`} data-testid={`timeline-event-${index}`}>
            <div className={styles.marker}>{iconFor(event.status)}</div>
            <div className={styles.eventCopy}>
              <div className={styles.eventTopline}>
                <strong>{event.status}</strong>
                <span>{formatted.date} · {formatted.time}</span>
              </div>
              <p>{event.description || (event.location ? 'Movimiento registrado por el courier.' : 'Actualización del envío.')}</p>
              {event.location && <div className={styles.location}><MapPin size={12} /> {event.location}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function TimelineSkeleton() {
  return (
    <div className={styles.timelineSkeleton} aria-label="Cargando historial">
      {[1, 2, 3].map((item) => (
        <div className={styles.skeletonEvent} key={item}>
          <div className="skeleton" />
          <div><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div>
        </div>
      ))}
    </div>
  );
}
