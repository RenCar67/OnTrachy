import { useCallback, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'packagemate.savedPackages';

function readSavedPackages() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (!value) return [];
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof item.trackingNumber === 'string' &&
        typeof item.title === 'string' &&
        typeof item.carrier === 'string' &&
        typeof item.savedAt === 'string',
    );
  } catch {
    return [];
  }
}

export function useSavedPackages() {
  const [savedPackages, setSavedPackages] = useState(readSavedPackages);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedPackages));
  }, [savedPackages]);

  const savePackage = useCallback((pkg, customTitle) => {
    const saved = {
      trackingNumber: pkg.trackingNumber,
      title: customTitle?.trim() || pkg.title?.trim() || `Envío ${pkg.trackingNumber}`,
      carrier: pkg.carrier,
      savedAt: new Date().toISOString(),
    };

    setSavedPackages((current) => [
      saved,
      ...current.filter((item) => item.trackingNumber !== saved.trackingNumber),
    ]);
  }, []);

  const removePackage = useCallback((trackingNumber) => {
    setSavedPackages((current) =>
      current.filter((item) => item.trackingNumber !== trackingNumber),
    );
  }, []);

  const savedNumbers = useMemo(
    () => new Set(savedPackages.map((item) => item.trackingNumber)),
    [savedPackages],
  );

  const isSaved = useCallback(
    (trackingNumber) => savedNumbers.has(trackingNumber),
    [savedNumbers],
  );

  return { savedPackages, savePackage, removePackage, isSaved, savedNumbers };
}
