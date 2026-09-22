import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { useTheme, RADIUS } from '@/theme/theme';
import { CheckIcon, TrashIcon } from '@/components/Icon';
import { inkOn } from '@/lib/utils';
import { CATEGORY_PALETTE } from '@/types';

/** Categoria, sia dei link sia dei posti: le due tabelle hanno la stessa
 * forma e questo foglio non ha motivo di distinguerle. */
interface Category {
  id: string;
  name: string;
  color: string;
}

interface CategorySheetProps {
  /** `null` tiene il foglio chiuso. */
  category: Category | null;
  /** Quanti elementi contiene: se è zero l'eliminazione non chiede conferma. */
  itemCount: number;
  /** Come chiamare quegli elementi al plurale: "link", "posti". */
  itemLabel: string;
  /** Categoria in cui finiscono gli elementi rimasti — la più vecchia del
   * gruppo, come fa la funzione di eliminazione lato database. */
  fallbackName: string;
  /** false quando la categoria non è eliminabile (l'ultima rimasta, o
   * quella predefinita che si preferisce tenere). */
  canDelete: boolean;
  /** Nome e colore insieme: si salva una volta sola. */
  onSave: (name: string, color: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}

/**
 * Rinomina ed elimina una categoria.
 *
 * Stava scritto quasi identico in tre file — sezione Link, mappa del
 * telefono e mappa del browser — e ogni ritocco andava fatto tre volte.
 *
 * La conferma di eliminazione è un passaggio dentro il foglio stesso e non
 * un avviso di sistema: `Alert.alert` non fa assolutamente nulla su web in
 * react-native-web, quindi lì i pulsanti sarebbero inerti.
 */
export function CategorySheet({
  category,
  itemCount,
  itemLabel,
  fallbackName,
  canDelete,
  onSave,
  onDelete,
  onClose,
}: CategorySheetProps) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState('');
  const [color, setColor] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  // Aprendo una categoria diversa si riparte dal nome giusto e mai da una
  // conferma rimasta a metà.
  useEffect(() => {
    setDraft(category?.name ?? '');
    setColor(category?.color ?? '');
    setConfirming(false);
    setBusy(false);
  }, [category?.id, category?.name, category?.color]);

  const close = () => {
    setConfirming(false);
    onClose();
  };

  const save = async () => {
    if (!draft.trim() || busy) return;
    setBusy(true);
    try {
      await onSave(draft.trim().slice(0, 24), color);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onDelete();
    } finally {
      setBusy(false);
    }
  };

  /** Senza elementi dentro non c'è niente da spostare: si elimina subito. */
  const askDelete = () => (itemCount === 0 ? remove() : setConfirming(true));

  if (!category) {
    return (
      <BottomSheet visible={false} onClose={close}>
        {null}
      </BottomSheet>
    );
  }

  return (
    <BottomSheet visible onClose={close}>
      {confirming ? (
        <>
          <Text style={[styles.title, { color: colors.text }]}>Eliminare &quot;{category.name}&quot;?</Text>
          <Text style={[styles.sub, { color: colors.textDim }]}>
            Contiene ancora {itemCount} {itemLabel}. Verranno spostati nella categoria &quot;{fallbackName}&quot;.
          </Text>
          <View style={styles.actions}>
            <Pressable onPress={() => setConfirming(false)} disabled={busy} style={[styles.btnSecondary, { backgroundColor: colors.surface2 }]}>
              <Text style={{ color: colors.textDim, fontWeight: '600' }}>Annulla</Text>
            </Pressable>
            <Pressable onPress={remove} disabled={busy} style={[styles.btnPrimary, { backgroundColor: colors.danger, opacity: busy ? 0.6 : 1 }]}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Elimina</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          <Text style={[styles.title, { color: colors.text }]}>Categoria</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surface2, color: colors.text }]}
            value={draft}
            onChangeText={setDraft}
            maxLength={24}
            onSubmitEditing={save}
          />
          <Text style={[styles.label, { color: colors.textFaint }]}>COLORE</Text>
          {/* La stessa tavolozza dei gruppi. Il colore è quello delle
              etichette, dei filtri e — per i posti — dei segnaposto. */}
          <View style={styles.swatches}>
            {CATEGORY_PALETTE.map((c) => {
              const on = c.toUpperCase() === color.toUpperCase();
              return (
                <Pressable
                  key={c}
                  onPress={() => setColor(c)}
                  style={[styles.swatch, { backgroundColor: c, borderColor: on ? colors.text : 'transparent' }]}
                >
                  {on ? <CheckIcon size={14} color={inkOn(c)} /> : null}
                </Pressable>
              );
            })}
          </View>
          <Pressable
            onPress={save}
            disabled={busy || !draft.trim()}
            style={[styles.saveBtn, { backgroundColor: colors.amber, opacity: busy || !draft.trim() ? 0.5 : 1 }]}
          >
            <Text style={{ color: colors.inkOnAmber, fontWeight: '800', fontSize: 14.5 }}>Salva</Text>
          </Pressable>
          {canDelete ? (
            <Pressable onPress={askDelete} disabled={busy} style={styles.deleteBtn}>
              <TrashIcon size={15} color={colors.danger} />
              <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '700', textAlign: 'center' }}>
                Elimina categoria
                {itemCount > 0 ? ` · ${itemCount} ${itemLabel} passano in «${fallbackName}»` : ''}
              </Text>
            </Pressable>
          ) : null}
        </>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, marginBottom: 10 },
  label: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8, marginTop: 6, marginBottom: 8 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  swatch: { width: 38, height: 38, borderRadius: 12, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  saveBtn: { marginTop: 16, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  sub: { fontSize: 12.5, marginBottom: 12, lineHeight: 18 },
  input: { borderRadius: RADIUS.sm, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14.5, marginBottom: 10 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btnSecondary: { flex: 1, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { flex: 1, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  deleteBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, paddingTop: 16, paddingBottom: 4, paddingHorizontal: 10 },
});
