import React from 'react';
import { Platform } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { GuscioData, type CampoDataProps } from '@/components/GuscioData';

/** 'AAAA-MM-GG' ↔ il giorno a mezzanotte, ora locale: passando da UTC il
 * giorno scelto potrebbe diventare quello prima. */
function daIso(iso: string): Date {
  const [a, m, g] = iso.split('-').map(Number);
  return new Date(a, m - 1, g);
}
function aIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Una data scelta dal calendario del telefono. Prima si scriveva a mano,
 * GG/MM/AAAA: con la tastiera del telefono è scomodo, e una data scritta
 * male («12/4/27») non si salvava.
 */
export function CampoData(props: CampoDataProps) {
  const { valore, onCambia, minimo } = props;
  const minimumDate = minimo ? daIso(minimo) : undefined;
  const value = valore ? daIso(valore) : (minimumDate ?? new Date());
  const scelta = (e: DateTimePickerEvent, d?: Date) => {
    if (e.type === 'set' && d) onCambia(aIso(d));
  };
  if (Platform.OS === 'ios') {
    // Su iPhone il calendario vive nel campo stesso.
    return <DateTimePicker value={value} mode="date" display="compact" minimumDate={minimumDate} onChange={scelta} />;
  }
  return (
    <GuscioData
      {...props}
      onApri={() => DateTimePickerAndroid.open({ value, mode: 'date', minimumDate, onChange: scelta })}
    />
  );
}
