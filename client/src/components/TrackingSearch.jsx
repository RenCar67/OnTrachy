import React, { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import styles from '../styles/dashboard.module.css';

export function TrackingSearch({ onSearch, loading }) {
  const [trackingNumber, setTrackingNumber] = useState('');

  const detectBadge = (code) => {
    const clean = code.trim().toUpperCase();
    if (/^[A-Z]{2}[0-9]{9}JP$/.test(clean)) {
      return { text: 'Japan Post', class: styles.badgeJp };
    }
    const isCorreosInt = /^[A-Z]{2}[0-9]{9}CL$/.test(clean);
    const isCorreosNac = /^(?!569)[0-9]{12}$/.test(clean);
    if (isCorreosInt || isCorreosNac) {
      return { text: 'Correos Chile', class: styles.badgeCl };
    }
    return null;
  };

  const badge = detectBadge(trackingNumber);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!trackingNumber.trim()) return;
    onSearch(trackingNumber.trim());
  };

  return (
    <form className={styles.searchForm} onSubmit={handleSubmit}>
      <div className={styles.inputWrapper}>
        <input
          type="text"
          id="tracking-input"
          className={styles.searchInput}
          placeholder="Ingresa guía (ej: EJ123456789JP o 12 dígitos)..."
          value={trackingNumber}
          onChange={(e) => setTrackingNumber(e.target.value)}
          disabled={loading}
        />
        {badge && <span className={`${styles.badge} ${badge.class}`}>{badge.text}</span>}
      </div>
      <button
        type="submit"
        id="search-button"
        className={styles.searchButton}
        disabled={loading || !badge}
      >
        {loading ? <Loader2 className={styles.spinner} /> : <Search size={18} />}
        Consultar
      </button>
    </form>
  );
}
