import { ArrowRight, CheckCircle2, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import styles from '../styles/App.module.css';

function getDetectedCarrier(value) {
  const normalized = value.trim().toUpperCase();
  if (normalized.endsWith('JP')) return 'Japan Post';
  if (normalized.endsWith('CL') || /^\d{12}$/.test(normalized)) return 'Correos de Chile';
  return '';
}

export function TrackingSearch({ isLoading, error, onSearch }) {
  const [value, setValue] = useState('');
  const detectedCarrier = useMemo(() => getDetectedCarrier(value), [value]);
  const isPossibleGuide = /^[A-Z0-9]{8,18}$/.test(value.trim().toUpperCase());

  async function submit(event) {
    event.preventDefault();
    if (!value.trim()) return;
    await onSearch(value.trim().toUpperCase());
  }

  return (
    <form className={styles.searchCard} onSubmit={submit} data-testid="form-search-package">
      <label className={styles.searchLabel} htmlFor="tracking-number">
        <span>Número de seguimiento</span>
        <span className={styles.formatHint}>Japan Post · Correos de Chile</span>
      </label>
      <div className={styles.searchRow}>
        <div className={styles.inputWrap}>
          <Search className={styles.searchIcon} size={17} />
          <input
            id="tracking-number"
            className={styles.searchInput}
            value={value}
            onChange={(e) => setValue(e.target.value.toUpperCase())}
            placeholder="Ej. RR123456789JP"
            autoComplete="off"
            spellCheck={false}
            aria-label="Número de seguimiento"
            data-testid="input-tracking-number"
          />
          {detectedCarrier && (
            <span className={styles.detectedCarrier}>
              <span className={styles.carrierDot} /> {detectedCarrier}
            </span>
          )}
        </div>
        <button className={styles.searchButton} disabled={isLoading || !isPossibleGuide} type="submit" data-testid="button-search-package">
          {isLoading ? 'Consultando…' : <>Consultar <ArrowRight size={15} /></>}
        </button>
      </div>
      {error && <p className={styles.searchError} role="alert" data-testid="status-search-error">{error}</p>}
      {!error && detectedCarrier && <p className={styles.demoNotice}><CheckCircle2 size={13} /> Courier detectado automáticamente por el formato</p>}
    </form>
  );
}
