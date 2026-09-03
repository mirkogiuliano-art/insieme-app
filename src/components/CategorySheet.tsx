import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { useTheme, RADIUS } from '@/theme/theme';

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
  onRename: (name: string) => Promise<void>;
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
  onRename,
  onDelete,
  onClose,
}: CategorySheetProps) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  // Aprendo una categoria diversa si riparte dal nome giusto e mai da una
  // conferma rimasta a metà.
  useEffect(() => {
    setDraft(category?.name ?? '');
    setConfirming(false);
    setBusy(false);
  }, [category?.id, category?.name]);

  const close = () => {
    setConfirming(false);
    onClose();
  };

  const rename = async () => {
    if (!draft.trim() || busy) return;
    setBusy(true);
    try {
      await onRename(draft.trim().slice(0, 24));
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
            <Pressable onPress={() => setConfirming(false)} disabled={busy} style={[styles.btnSecondary, { borderColor: colors.border }]}>
              <Text style={{ color: colors.textDim, fontWeight: '600' }}>Annulla</Text>
            </Pressable>
            <Pressable onPress={remove} disabled={busy} style={[styles.btnPrimary, { backgroundColor: colors.danger, opacity: busy ? 0.6 : 1 }]}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Elimina</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          <Text style={[styles.title, { color: colors.text }]}>Gestisci categoria</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text }]}
            value={draft}
            onChangeText={setDraft}
            maxLength={24}
            onSubmitEditing={rename}
          />
          <View style={styles.actions}>
            <Pressable onPress={close} style={[styles.btnSecondary, { borderColor: colors.border }]}>
              <Text style={{ color: colors.textDim, fontWeight: '600' }}>Annulla</Text>
            </Pressable>
            <Pressable
              onPress={rename}
              disabled={busy}
              style={[styles.btnPrimary, { backgroundColor: colors.amber, opacity: busy ? 0.6 : 1 }]}
            >
              <Text style={{ color: colors.inkOnAmber, fontWeight: '700' }}>Salva nome</Text>
            </Pressable>
          </View>
          {canDelete ? (
            <Pressable onPress={askDelete} disabled={busy} style={styles.deleteBtn}>
              <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '600' }}>Elimina categoria</Text>
            </Pressable>
          ) : null}
        </>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '700', marginBottom: 2 },
  sub: { fontSize: 12.5, marginBottom: 12, lineHeight: 18 },
  input: { borderWidth: 1, borderRadius: RADIUS.sm, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14.5, marginBottom: 10 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btnSecondary: { flex: 1, paddingVertical: 12, borderRadius: RADIUS.sm, borderWidth: 1, alignItems: 'center' },
  btnPrimary: { flex: 1, paddingVertical: 12, borderRadius: RADIUS.sm, alignItems: 'center' },
  deleteBtn: { alignItems: 'center', paddingTop: 14, marginTop: 4 },
});
