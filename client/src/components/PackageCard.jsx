import { Activity, ChevronDown, Inbox } from 'lucide-react';
import { PackageSummary } from './PackageSummary.jsx';
import { Timeline, TimelineSkeleton } from './Timeline.jsx';
import styles from '../styles/PackageCard.module.css';

export function PackageCard({ data, isSaved, isLoading, onSave, onRemove, onRefresh }) {
  if (isLoading && !data) {
    return (
      <section className={styles.card} aria-label="Cargando información">
        <div className={styles.loadingSummary}><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div>
        <TimelineSkeleton />
      </section>
    );
  }

  if (!data) {
    return (
      <section className={styles.emptyCard} data-testid="empty-package-state">
        <div className={styles.emptyIcon}><Inbox size={24} /></div>
        <h2>Tu seguimiento empieza aquí</h2>
        <p>Ingresa un número de seguimiento arriba para ver cada movimiento, desde el origen hasta tu puerta.</p>
      </section>
    );
  }

  return (
    <section className={styles.card} data-testid="package-result">
      <PackageSummary data={data} isSaved={isSaved} isLoading={isLoading} onSave={onSave} onRemove={onRemove} onRefresh={onRefresh} />
      <div className={styles.timelineHeader}>
        <div><Activity size={15} /><h3>Historial de eventos</h3></div>
        <span>{data.history.length} {data.history.length === 1 ? 'evento' : 'eventos'}</span>
      </div>
      {isLoading ? <TimelineSkeleton /> : <Timeline events={data.history} />}
      <div className={styles.cardFoot}><ChevronDown size={14} /> El historial se actualiza al consultar nuevamente</div>
    </section>
  );
}
