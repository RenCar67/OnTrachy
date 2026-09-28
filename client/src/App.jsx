import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { trackPackage } from './services/api.js';
import { TrackingSearch } from './components/TrackingSearch.jsx';
import { PackageSummary } from './components/PackageSummary.jsx';
import { Timeline } from './components/Timeline.jsx';
import styles from './styles/dashboard.module.css';

export default function App() {
  const [pkg, setPkg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSearch = async (trackingNumber) => {
    setLoading(true);
    setError(null);
    try {
      const result = await trackPackage(trackingNumber);
      setPkg(result);
    } catch (err) {
      const message = err.response?.data?.error || err.message || 'Error de conexión con el servidor';
      setError(message);
      setPkg(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.headerTitle}>PackageMate</h1>
        <p className={styles.headerSub}>Seguimiento Japan Post · Correos de Chile</p>
      </header>

      <TrackingSearch onSearch={handleSearch} loading={loading} />

      {error && (
        <div className={styles.errorBox}>
          <AlertTriangle size={18} />
          {error}
        </div>
      )}

      {pkg && <PackageSummary pkg={pkg} />}
      {pkg && pkg.history && pkg.history.length > 0 && <Timeline history={pkg.history} />}
    </div>
  );
}
