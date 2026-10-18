import React from 'react';
import {StyleSheet, Text, View, type StyleProp, type ViewStyle} from 'react-native';
import type {LucideIcon} from 'lucide-react-native';

import {theme} from '../../theme/tokens';
import {Button} from './Button';

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  message?: string;
  action?: {label: string; onPress: () => void};
  style?: StyleProp<ViewStyle>;
}

export const EmptyState = ({icon: Icon, title, message, action, style}: EmptyStateProps): React.JSX.Element => (
  <View style={[styles.container, style]}>
    <View style={styles.iconCircle}>
      <Icon size={28} color={theme.colors.muted} strokeWidth={2} />
    </View>
    <Text style={styles.title}>{title}</Text>
    {message ? <Text style={styles.message}>{message}</Text> : null}
    {action ? (
      <Button label={action.label} onPress={action.onPress} variant="secondary" style={styles.action} />
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xxxl,
    paddingHorizontal: theme.spacing.xxl,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.lg,
  },
  title: {...theme.type.cardTitle, color: theme.colors.text, textAlign: 'center'},
  message: {...theme.type.body, color: theme.colors.muted, textAlign: 'center', marginTop: theme.spacing.xs},
  action: {marginTop: theme.spacing.lg},
});
