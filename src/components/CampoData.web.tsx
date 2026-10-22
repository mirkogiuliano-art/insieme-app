import React from 'react';
import { GuscioData, type CampoDataProps } from '@/components/GuscioData';

/** Sul web il calendario è quello del browser: un campo data invisibile
 * steso sopra il campo, che si apre al clic. */
export function CampoData(props: CampoDataProps) {
  const { valore, onCambia, minimo, etichetta } = props;
  return (
    <GuscioData {...props}>
      <input
        type="date"
        aria-label={etichetta}
        value={valore ?? ''}
        min={minimo ?? undefined}
        onChange={(e) => onCambia(e.target.value || null)}
        onClick={(e) => e.currentTarget.showPicker?.()}
        style={{ position: 'absolute', left: 0, top: 0, bottom: 0, right: valore ? 38 : 0, opacity: 0, cursor: 'pointer', border: 0, padding: 0 }}
      />
    </GuscioData>
  );
}
