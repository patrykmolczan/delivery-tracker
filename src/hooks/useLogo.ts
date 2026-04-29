import { useState, useEffect } from 'react';
import { fetchAppSettings } from '../lib/data';

export function useLogo() {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAppSettings()
      .then(settings => setLogoUrl(settings.logo_url ?? null))
      .catch(() => setLogoUrl(null))
      .finally(() => setLoading(false));
  }, []);

  return { logoUrl, loading, setLogoUrl };
}
