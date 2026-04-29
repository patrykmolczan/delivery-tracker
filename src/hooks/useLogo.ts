import { useState, useEffect } from 'react';
import { fetchAppSettings } from '../lib/data';

export function useLogo() {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loginIconUrl, setLoginIconUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAppSettings()
      .then(settings => {
        setLogoUrl(settings.logo_url || null);
        setLoginIconUrl(settings.login_icon_url || null);
      })
      .catch(() => {
        setLogoUrl(null);
        setLoginIconUrl(null);
      })
      .finally(() => setLoading(false));
  }, []);

  return { logoUrl, loginIconUrl, loading, setLogoUrl, setLoginIconUrl };
}
