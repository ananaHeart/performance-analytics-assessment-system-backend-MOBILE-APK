import React from 'react';
import {StyleSheet, Text, View, type StyleProp, type ViewStyle} from 'react-native';
import type {LucideIcon} from 'lucide-react-native';

import {theme, type StatusTone} from '../../theme/tokens';

export interface BadgeProps {
  label: string;
  tone?: StatusTone;
  icon?: LucideIcon;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export const Badge = ({
  label,
  tone = 'neutral',
  icon: Icon,
  style,
  accessibilityLabel,
}: BadgeProps): React.JSX.Element => {
  const palette = theme.status[tone];
  return (
    <View
      style={[styles.badge, {backgroundColor: palette.bg}, style]}
      accessibilityLabel={accessibilityLabel}
    >
      {Icon ? <Icon size={14} color={palette.text} strokeWidth={2.4} /> : null}
      <Text style={[styles.label, {color: palette.text}]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    minHeight: 24,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: theme.radius.pill,
    maxWidth: '100%',
  },
  label: {...theme.type.label, flexShrink: 1},
});
