import React from 'react';
import {Pressable, StyleSheet, type StyleProp, type ViewStyle} from 'react-native';
import type {LucideIcon} from 'lucide-react-native';

import {theme} from '../../theme/tokens';

export interface IconButtonProps {
  icon: LucideIcon;
  /** Read by TalkBack - an icon-only control must always say what it does. */
  accessibilityLabel: string;
  onPress?: () => void;
  color?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export const IconButton = ({
  icon: Icon,
  accessibilityLabel,
  onPress,
  color = theme.colors.text,
  disabled = false,
  style,
  testID,
}: IconButtonProps): React.JSX.Element => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel}
    accessibilityState={{disabled}}
    testID={testID}
    style={({pressed}) => [styles.base, pressed && styles.pressed, style]}
  >
    <Icon
      size={theme.iconSize.regular}
      color={disabled ? theme.colors.faint : color}
      strokeWidth={2.2}
    />
  </Pressable>
);

const styles = StyleSheet.create({
  base: {
    width: theme.touchTarget,
    height: theme.touchTarget,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {backgroundColor: theme.colors.surfaceSunken},
});
