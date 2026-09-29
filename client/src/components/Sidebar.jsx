import { Box, Trash2 } from 'lucide-react';
import styles from '../styles/Sidebar.module.css';

export function Sidebar({
  savedPackages,
  selectedNumber,
  isOpen,
  onClose,
  onSelect,
  onRemove,
}) {
  return (
    <>
      {isOpen && <button className={styles.mobileOverlay} aria-label="Cerrar menú" data-testid="button-close-sidebar" onClick={onClose} />}
      <aside className={`${styles.sidebar} ${isOpen ? styles.sidebarOpen : ''}`} aria-label="Envíos guardados">
        <div className={styles.brand}>
          <div className={styles.brandMark}><Box size={17} strokeWidth={2.5} /></div>
          <div className={styles.brandName}>Package<span>Mate</span></div>
        </div>

        <p className={styles.sidebarHeading}>Envíos guardados</p>
        <div className={styles.savedList}>
          {savedPackages.length === 0 ? (
            <div className={styles.emptySaved} data-testid="empty-saved-packages">
              Aún no tienes envíos guardados. Busca un envío y guárdalo para acceder rápido.
            </div>
          ) : savedPackages.map((item) => (
            <div
              className={`${styles.savedItem} ${selectedNumber === item.trackingNumber ? styles.savedItemActive : ''}`}
              key={item.trackingNumber}
              data-testid={`saved-package-${item.trackingNumber}`}
            >
              <button className={styles.savedItem} onClick={() => { onSelect(item.trackingNumber); onClose(); }} aria-label={`Abrir ${item.title}`}>
                <span className={styles.packageIcon}><Box size={14} /></span>
                <span className={styles.savedCopy}>
                  <span className={styles.savedTitle}>{item.title}</span>
                  <span className={styles.savedNumber}>{item.trackingNumber}</span>
                </span>
              </button>
              <button
                className={styles.removeButton}
                onClick={() => onRemove(item.trackingNumber)}
                aria-label={`Eliminar ${item.title}`}
                data-testid={`button-remove-${item.trackingNumber}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        <div className={styles.sidebarFooter}>
          <div>Seguimiento claro para envíos que cruzan fronteras.</div>
          <div className={styles.footerStatus}><span className={styles.footerDot} /> Servicio operativo</div>
        </div>
      </aside>
    </>
  );
}
