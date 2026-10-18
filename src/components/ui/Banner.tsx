import React from 'react';
import {ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle} from 'react-native';
import {CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon} from 'lucide-react-native';

import {theme} from '../../theme/tokens';
import {Button, type ButtonVariant} from './Button';

export type BannerTone = 'info' | 'success' | 'warning' | 'danger';

const ICONS: Record<BannerTone, LucideIcon> = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleAlert,
};

export interface BannerProps {
  tone?: BannerTone;
  title?: string;
  message?: React.ReactNode;
  /** Replaces the icon with a spinner, for work still in progress. */
  busy?: boolean;
  icon?: LucideIcon | null;
  action?: {label: string; onPress: () => void; variant?: ButtonVariant; disabled?: boolean};
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export const Banner = ({
  tone = 'info',
  title,
  message,
  busy = false,
  icon,
  action,
  children,
  style,
  testID,
}: BannerProps): React.JSX.Element => {
  const palette = theme.status[tone];
  const Icon = icon === undefined ? ICONS[tone] : icon;
  return (
    <View
      style={[styles.banner, {backgroundColor: palette.soft, borderColor: palette.border}, style]}
      accessibilityLiveRegion="polite"
      testID={testID}
    >
      <View style={styles.row}>
        {busy ? (
          <ActivityIndicator size="small" color={palette.text} style={styles.icon} />
        ) : Icon ? (
          <Icon size={theme.iconSize.small} color={palette.text} strokeWidth={2.2} style={styles.icon} />
        ) : null}
        <View style={styles.copy}>
          {title ? <Text style={[styles.title, {color: palette.text}]}>{title}</Text> : null}
          {typeof message === 'string' ? (
            <Text style={styles.message}>{message}</Text>
          ) : (
            message ?? null
          )}
          {children}
        </View>
      </View>
      {action ? (
        <Button
          label={action.label}
          onPress={action.onPress}
          variant={action.variant ?? 'secondary'}
          disabled={action.disabled}
          style={styles.action}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    borderWidth: 1,
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
  },
  row: {flexDirection: 'row', gap: theme.spacing.md, alignItems: 'flex-start'},
  icon: {marginTop: 1},
  copy: {flex: 1, gap: 2},
  title: {...theme.type.bodyStrong},
  message: {...theme.type.body, color: theme.colors.textSecondary},
  action: {marginTop: theme.spacing.md, alignSelf: 'flex-start'},
});
