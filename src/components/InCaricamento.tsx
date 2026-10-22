import React, { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { useTheme } from '@/theme/theme';
import { useT } from '@/i18n';

/** Al posto di «non c'è niente» finché una sezione non ha finito di
 * leggere: prima diceva «nessun messaggio», e qualche secondo dopo
 * comparivano i messaggi. Per mezzo secondo non mostra niente, perché una
 * lettura veloce non deve far lampeggiare la rotellina; poi la rotellina. */
export function InCaricamento() {
  const { colors } = useTheme();
  const t = useT();
  const [visibile, setVisibile] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setVisibile(true), 500);
    return () => clearTimeout(id);
  }, []);
  if (!visibile) return null;
  return <ActivityIndicator size="small" color={colors.textFaint} accessibilityLabel={t.accessibilita.caricamento} />;
}
