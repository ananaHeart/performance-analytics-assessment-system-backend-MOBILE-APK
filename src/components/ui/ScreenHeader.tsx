import React from 'react';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';
import {ChevronLeft, X} from 'lucide-react-native';

import {theme} from '../../theme/tokens';
import {IconButton} from './IconButton';

export interface ScreenHeaderProps {
  title: string;
  subtitle?: React.ReactNode;
  /** Shows a back arrow on the left. */
  onBack?: () => void;
  backLabel?: string;
  /** Shows a close (X) button on the left instead of a back arrow. */
  onClose?: () => void;
  closeLabel?: string;
  navigationDisabled?: boolean;
  /** Right-hand slot, e.g. a score badge or icon buttons. */
  right?: React.ReactNode;
  busy?: boolean;
}

/** The white top bar of every pushed screen and full-screen modal. */
export const ScreenHeader = ({
  title,
  subtitle,
  onBack,
  backLabel = 'Back',
  onClose,
  closeLabel = 'Close',
  navigationDisabled = false,
  right,
  busy = false,
}: ScreenHeaderProps): React.JSX.Element => (
  <View style={[styles.header, subtitle ? styles.withSubtitle : null]}>
    {onBack ? (
      <IconButton icon={ChevronLeft} accessibilityLabel={backLabel} onPress={onBack} disabled={navigationDisabled} />
    ) : onClose ? (
      <IconButton icon={X} accessibilityLabel={closeLabel} onPress={onClose} disabled={navigationDisabled} />
    ) : (
      <View style={styles.edgeSpacer} />
    )}
    <View style={styles.copy}>
      <Text style={styles.title} numberOfLines={2} accessibilityRole="header">{title}</Text>
      {typeof subtitle === 'string' ? (
        <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text>
      ) : (
        subtitle ?? null
      )}
    </View>
    {right ? <View style={styles.right}>{right}</View> : null}
    {busy ? <ActivityIndicator color={theme.colors.primary} style={styles.spinner} /> : null}
  </View>
);

const styles = StyleSheet.create({
  header: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  withSubtitle: {minHeight: 64},
  edgeSpacer: {width: theme.spacing.md},
  copy: {flex: 1, paddingHorizontal: theme.spacing.xs, paddingVertical: theme.spacing.xs},
  title: {...theme.type.title, color: theme.colors.text},
  subtitle: {...theme.type.caption, color: theme.colors.muted, marginTop: 2},
  right: {flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, marginLeft: theme.spacing.xs},
  spinner: {marginHorizontal: theme.spacing.md},
});
