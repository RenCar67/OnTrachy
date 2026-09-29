import { Inbox } from 'lucide-react';
import styles from '../styles/PackageCard.module.css';

export function EmptyState({ title, description }) {
  return (
    <section className={styles.emptyCard}>
      <div className={styles.emptyIcon}><Inbox size={24} /></div>
      <h2>{title || 'Nada que mostrar'}</h2>
      <p>{description || 'No hay contenido disponible.'}</p>
    </section>
  );
}
