import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type {LucideIcon} from 'lucide-react-native';

import {theme} from '../../theme/tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'dangerOutline' | 'link';

interface VariantColors {
  background: string;
  pressed: string;
  border: string;
  text: string;
}

const {colors, status} = theme;

const VARIANTS: Record<ButtonVariant, VariantColors> = {
  primary: {background: colors.primary, pressed: colors.primaryPressed, border: colors.primary, text: colors.onPrimary},
  secondary: {background: colors.surface, pressed: colors.surfaceSunken, border: colors.borderStrong, text: colors.text},
  danger: {background: colors.danger, pressed: colors.dangerPressed, border: colors.danger, text: colors.onPrimary},
  dangerOutline: {background: colors.surface, pressed: status.danger.soft, border: colors.danger, text: colors.danger},
  link: {background: 'transparent', pressed: colors.surfaceSunken, border: 'transparent', text: colors.primary},
};

const DISABLED: VariantColors = {
  background: colors.surfaceSunken,
  pressed: colors.surfaceSunken,
  border: colors.border,
  text: colors.faint,
};

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: LucideIcon;
  /** Shows a spinner next to the label and ignores presses. */
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}

export const Button = ({
  label,
  onPress,
  variant = 'primary',
  icon: Icon,
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: ButtonProps): React.JSX.Element => {
  const inactive = disabled || loading;
  const palette = disabled ? DISABLED : VARIANTS[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{disabled: inactive, busy: loading}}
      testID={testID}
      style={({pressed}) => [
        styles.base,
        {
          backgroundColor: pressed ? palette.pressed : palette.background,
          borderColor: palette.border,
        },
        fullWidth && styles.fullWidth,
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="small" color={palette.text} />
        ) : Icon ? (
          <Icon size={theme.iconSize.small} color={palette.text} strokeWidth={2.2} />
        ) : null}
        <Text style={[styles.label, {color: palette.text}]}>{label}</Text>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    minHeight: theme.touchTarget,
    minWidth: theme.touchTarget,
    borderRadius: theme.radius.control,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md - 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: {alignSelf: 'stretch'},
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    flexShrink: 1,
  },
  label: {...theme.type.button, textAlign: 'center', flexShrink: 1},
});
