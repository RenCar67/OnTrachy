import { useCallback, useMemo, useState } from 'react';
import { Menu, Radio, RotateCcw } from 'lucide-react';
import { PackageCard } from './components/PackageCard.jsx';
import { TrackingSearch } from './components/TrackingSearch.jsx';
import { Sidebar } from './components/Sidebar.jsx';
import { usePackages } from './hooks/usePackages.js';
import styles from './styles/App.module.css';

function App() {
  const {
    savedPackages,
    savedNumbers,
    selectedPackage,
    setSelectedPackage,
    isLoading,
    error,
    setError,
    search,
    save,
    remove,
    loadSaved,
  } = usePackages();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const activePackage = selectedPackage;
  const activeIsSaved = useMemo(
    () => Boolean(activePackage && savedNumbers.has(activePackage.trackingNumber)),
    [activePackage, savedNumbers],
  );

  const handleSearch = useCallback(async (trackingNumber) => {
    await search(trackingNumber);
  }, [search]);

  const handleSelect = useCallback(async (trackingNumber) => {
    await loadSaved(trackingNumber);
  }, [loadSaved]);

  const handleSave = useCallback(async (title) => {
    if (!activePackage) return;
    await save(activePackage, title);
  }, [activePackage, save]);

  const handleRefresh = useCallback(async () => {
    if (!activePackage) return;
    await search(activePackage.trackingNumber);
  }, [activePackage, search]);

  function handleRemove(trackingNumber) {
    remove(trackingNumber);
  }

  return (
    <div className={styles.appShell}>
      <Sidebar
        savedPackages={savedPackages}
        selectedNumber={activePackage?.trackingNumber}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onSelect={handleSelect}
        onRemove={handleRemove}
      />
      <div className={styles.mainColumn}>
        <header className={styles.topbar}>
          <button className={styles.mobileMenu} onClick={() => setIsSidebarOpen(true)} aria-label="Abrir envíos guardados" data-testid="button-open-sidebar">
            <Menu size={18} />
          </button>
          <span className={styles.mobileTitle}>PackageMate</span>
          <div className={styles.topbarStatus}>
            <span className={styles.statusSignal} />
            <span>Sistema de seguimiento operativo</span>
            <Radio size={14} />
          </div>
        </header>

        <main className={styles.content}>
          <section className={styles.hero}>
            <div className={styles.eyebrow}><span className={styles.eyebrowLine} /> Control de envíos</div>
            <h1>Todo el recorrido,<br />en un solo lugar.</h1>
            <p>Consulta tus envíos internacionales con la precisión que necesitas. Sin ruido, solo el estado que importa.</p>
          </section>

          <TrackingSearch isLoading={isLoading} error={error} onSearch={handleSearch} />

          <div className={styles.sectionHeading}>
            <h2>Seguimiento actual</h2>
            {activePackage && <span>ACTUALIZADO EN VIVO</span>}
          </div>

          {error && !activePackage ? (
            <div className={styles.errorBox} role="alert" data-testid="status-package-error">
              <strong>No pudimos cargar este envío.</strong><br />
              {error}
              <br />
              <button className={styles.retryButton} onClick={() => setError('')} data-testid="button-dismiss-error"><RotateCcw size={12} /> Intentar otro envío</button>
            </div>
          ) : (
            <div className={styles.workspace}>
              <PackageCard
                data={activePackage}
                isSaved={activeIsSaved}
                isLoading={isLoading}
                onSave={handleSave}
                onRemove={() => activePackage && handleRemove(activePackage.trackingNumber)}
                onRefresh={handleRefresh}
              />
              <aside className={styles.sideCard}>
                <div className={styles.sectionHeading}><h2>Accesos rápidos</h2></div>
                <p className={styles.shortcutCopy}>
                  Guarda envíos para consultarlos rápidamente desde aquí y desde la barra lateral.
                </p>
                <div className={styles.shortcutCount}>
                  {savedPackages.length === 0 ? 'Aún no tienes envíos guardados.' : `${savedPackages.length} ${savedPackages.length === 1 ? 'envío guardado' : 'envíos guardados'}`}
                </div>
              </aside>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
