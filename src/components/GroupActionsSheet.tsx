import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { useTheme, RADIUS, FONT_ROUNDED } from '@/theme/theme';
import { ShareIcon, UsersIcon, CheckIcon, BackIcon, LogoutIcon } from '@/components/Icon';
import { groupColor } from '@/lib/appStore';
import { inkOn } from '@/lib/utils';
import { GROUP_PALETTE, type Group } from '@/types';

interface GroupActionsSheetProps {
  /** `null` tiene il foglio chiuso. */
  group: Group | null;
  memberCount: number | null;
  unread: number;
  /** "attivo 2 min fa", quando si sa. */
  activity: string | null;
  onClose: () => void;
  onInvite: (group: Group) => void;
  onInfo: (group: Group) => void;
  onColor: (group: Group, color: string) => void;
  onMarkRead: (group: Group) => void;
  onLeave: (group: Group) => Promise<void>;
}

type Step = 'menu' | 'color' | 'leave';

/**
 * Tutto quello che si può fare su un gruppo senza entrarci: lo stesso menu
 * di link, posti e messaggi. Si apre col ⋯ sulla scheda o tenendola premuta.
 */
export function GroupActionsSheet({
  group,
  memberCount,
  unread,
  activity,
  onClose,
  onInvite,
  onInfo,
  onColor,
  onMarkRead,
  onLeave,
}: GroupActionsSheetProps) {
  const { colors } = useTheme();
  const [step, setStep] = useState<Step>('menu');
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    setStep('menu');
    setLeaving(false);
  }, [group?.id]);

  if (!group) return <BottomSheet visible={false} onClose={onClose}>{null}</BottomSheet>;
  const tint = groupColor(group);

  const run = (fn: () => void) => {
    onClose();
    fn();
  };

  const Item = ({ icon, label, danger, onPress }: { icon: React.ReactNode; label: string; danger?: boolean; onPress: () => void }) => (
    <Pressable onPress={onPress} style={[styles.item, { borderTopColor: colors.border }]}>
      {icon}
      <Text style={[styles.itemText, { color: danger ? colors.danger : colors.text }]}>{label}</Text>
    </Pressable>
  );

  const StepTitle = ({ title }: { title: string }) => (
    <View style={styles.stepTitleRow}>
      <Pressable onPress={() => setStep('menu')} hitSlop={10}>
        <BackIcon size={20} color={colors.textDim} />
      </Pressable>
      <Text style={[styles.stepTitle, { color: colors.text }]}>{title}</Text>
    </View>
  );

  if (step === 'color') {
    return (
      <BottomSheet visible onClose={onClose}>
        <StepTitle title="Colore del gruppo" />
        <Text style={[styles.sub, { color: colors.textDim }]}>Cambia per tutti nel gruppo.</Text>
        <View style={styles.swatches}>
          {GROUP_PALETTE.map((c) => {
            const on = c.toUpperCase() === tint.toUpperCase();
            return (
              <Pressable
                key={c}
                onPress={() => (on ? setStep('menu') : run(() => onColor(group, c)))}
                style={[styles.swatch, { backgroundColor: c, borderColor: on ? colors.text : 'transparent' }]}
              >
                {on ? <CheckIcon size={16} color={inkOn(c)} /> : null}
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>
    );
  }

  if (step === 'leave') {
    const lastOne = memberCount === 1;
    return (
      <BottomSheet visible onClose={onClose}>
        <Text style={[styles.stepTitle, { color: colors.text }]}>{lastOne ? 'Sei l’ultimo rimasto' : 'Lasciare il gruppo?'}</Text>
        <Text style={[styles.body, { color: colors.textDim }]}>
          {lastOne
            ? 'Uscendo, il gruppo verrà eliminato per intero: chat, link, posti e categorie. Non si può annullare.'
            : 'Non vedrai più chat, link e posti di questo gruppo. Per rientrare ti servirà un nuovo link di invito.'}
        </Text>
        <View style={styles.actions}>
          <Pressable onPress={() => setStep('menu')} disabled={leaving} style={[styles.btn, { backgroundColor: colors.surface2 }]}>
            <Text style={{ color: colors.textDim, fontWeight: '600' }}>Annulla</Text>
          </Pressable>
          <Pressable
            onPress={async () => {
              setLeaving(true);
              try {
                await onLeave(group);
                onClose();
              } finally {
                setLeaving(false);
              }
            }}
            disabled={leaving}
            style={[styles.btn, { backgroundColor: colors.danger, opacity: leaving ? 0.6 : 1 }]}
          >
            {leaving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontWeight: '700' }}>{lastOne ? 'Esci ed elimina' : 'Lascia'}</Text>
            )}
          </Pressable>
        </View>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet visible onClose={onClose}>
      <View style={styles.header}>
        <View style={[styles.tile, { backgroundColor: tint }]}>
          <Text style={[styles.tileText, { color: inkOn(tint) }]}>{group.name.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
            {group.name}
          </Text>
          <Text style={[styles.headerSub, { color: colors.textDim }]} numberOfLines={1}>
            {[memberCount ? `${memberCount} ${memberCount === 1 ? 'membro' : 'membri'}` : null, activity].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>
      <Item icon={<ShareIcon size={17} color={colors.amber} />} label="Invita qualcuno" onPress={() => run(() => onInvite(group))} />
      <Item icon={<UsersIcon size={18} color={colors.teal} strokeWidth={2} />} label="Info gruppo e membri" onPress={() => run(() => onInfo(group))} />
      <Item
        icon={<View style={[styles.colorDot, { backgroundColor: tint, borderColor: colors.border }]} />}
        label="Cambia colore"
        onPress={() => setStep('color')}
      />
      {unread > 0 ? (
        <Item icon={<CheckIcon size={18} color={colors.textDim} />} label="Segna tutto come letto" onPress={() => run(() => onMarkRead(group))} />
      ) : null}
      <Item icon={<LogoutIcon size={17} color={colors.danger} strokeWidth={2} />} label="Lascia il gruppo" danger onPress={() => setStep('leave')} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 12 },
  tile: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tileText: { fontFamily: FONT_ROUNDED, fontSize: 21 },
  headerTitle: { fontSize: 16, fontWeight: '800' },
  headerSub: { fontSize: 12, marginTop: 1 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 14, borderTopWidth: 1 },
  itemText: { flex: 1, fontSize: 15, fontWeight: '600' },
  colorDot: { width: 18, height: 18, borderRadius: 6, borderWidth: 1 },
  stepTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  stepTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.2 },
  sub: { fontSize: 12.5, marginBottom: 14 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 6 },
  swatch: { width: 44, height: 44, borderRadius: 14, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  body: { fontSize: 12.5, lineHeight: 18, marginTop: 6, marginBottom: 16 },
  actions: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
