import { useCallback, useState } from 'react';
import { trackPackage, getPackage, getApiErrorMessage } from '../services/api.js';
import { useSavedPackages } from '../hooks/useSavedPackages.js';

export function usePackages() {
  const {
    savedPackages,
    savedNumbers,
    savePackage,
    removePackage,
    isSaved,
  } = useSavedPackages();
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const search = useCallback(async (trackingNumber) => {
    setIsLoading(true);
    setError('');
    try {
      const result = await trackPackage(trackingNumber);
      setSelectedPackage(result);
      return result;
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const save = useCallback(
    async (data, title) => {
      savePackage(data, title);
      return data;
    },
    [savePackage],
  );

  const loadSaved = useCallback(async (trackingNumber) => {
    setIsLoading(true);
    setError('');
    try {
      const result = await getPackage(trackingNumber);
      setSelectedPackage(result);
      return result;
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    savedPackages,
    savedNumbers,
    selectedPackage,
    setSelectedPackage,
    isLoading,
    error,
    setError,
    search,
    save,
    remove: removePackage,
    loadSaved,
    isSaved,
  };
}
