import { Bookmark, BookmarkCheck, Clock3, Copy, RefreshCw, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import styles from '../styles/PackageSummary.module.css';

function carrierClass(carrier) {
  return carrier.toLowerCase().includes('japan') ? styles.japan : styles.correos;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin datos';
  return new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
}

export function PackageSummary({ data, isSaved, isLoading, onSave, onRemove, onRefresh }) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [title, setTitle] = useState(data.title || 'Envío sin título');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setTitle(data.title || 'Envío sin título');
    setIsEditingTitle(false);
  }, [data.trackingNumber, data.title]);

  function copyTracking() {
    navigator.clipboard?.writeText(data.trackingNumber);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  async function save() {
    await onSave(title);
    setIsEditingTitle(false);
  }

  return (
    <div className={styles.summary}>
      <div className={styles.summaryHeader}>
        <div>
          <div className={styles.kicker}>Resumen del envío</div>
          {isEditingTitle ? (
            <div className={styles.titleEdit}>
              <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus aria-label="Título del envío" data-testid="input-package-title" />
              <button onClick={save} disabled={isLoading} data-testid="button-save-title">Guardar</button>
            </div>
          ) : (
            <h2 data-testid="text-package-title">{title}</h2>
          )}
          <div className={styles.numberLine}>
            <span className={styles.trackingNumber} data-testid="text-tracking-number">{data.trackingNumber}</span>
            <button className={styles.copyButton} onClick={copyTracking} aria-label="Copiar número de seguimiento" data-testid="button-copy-tracking">
              <Copy size={13} /> {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
        </div>
        <div className={styles.actions}>
          <button className={`${styles.saveButton} ${isSaved ? styles.saved : ''}`} onClick={isSaved ? onRemove : () => setIsEditingTitle(true)} disabled={isLoading} data-testid="button-save-package">
            {isSaved ? <><BookmarkCheck size={15} /> Quitar</> : <><Bookmark size={15} /> Guardar</>}
          </button>
          <button className={styles.refreshButton} onClick={onRefresh} disabled={isLoading} aria-label="Actualizar seguimiento" data-testid="button-refresh-package">
            <RefreshCw size={15} className={isLoading ? styles.spin : ''} />
          </button>
        </div>
      </div>
      <div className={styles.metaGrid}>
        <div className={styles.metaCell}>
          <span className={styles.metaLabel}>Courier</span>
          <span className={`${styles.carrier} ${carrierClass(data.carrier)}`}><span />{data.carrier}</span>
        </div>
        <div className={styles.metaCell}>
          <span className={styles.metaLabel}>Estado actual</span>
          <span className={styles.status}>{data.status}</span>
        </div>
        <div className={styles.metaCell}>
          <span className={styles.metaLabel}>Última consulta</span>
          <span className={styles.lastChecked}><Clock3 size={13} /> {formatDate(data.lastChecked)}</span>
        </div>
        <div className={styles.metaCell}>
          <span className={styles.metaLabel}>Seguimiento protegido</span>
          <span className={styles.secure}><ShieldCheck size={13} /> Activo</span>
        </div>
      </div>
    </div>
  );
}
