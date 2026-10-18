import React from 'react';
import {Pressable, StyleSheet, View, type StyleProp, type ViewStyle} from 'react-native';

import {theme} from '../../theme/tokens';

export interface CardProps {
  children: React.ReactNode;
  /** A 4px brand strip on the left edge. */
  accent?: boolean;
  /** Makes the whole card one pressable target. */
  onPress?: () => void;
  disabled?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}

export const Card = ({
  children,
  accent = false,
  onPress,
  disabled = false,
  padded = true,
  style,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: CardProps): React.JSX.Element => {
  const body = (
    <>
      {accent ? <View style={styles.accent} /> : null}
      <View style={[styles.body, padded && styles.padded]}>{children}</View>
    </>
  );
  if (!onPress) {
    return <View style={[styles.card, style]} testID={testID}>{body}</View>;
  }
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{disabled}}
      testID={testID}
      style={({pressed}) => [styles.card, pressed && styles.pressed, style]}
    >
      {body}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.card,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  pressed: {backgroundColor: theme.colors.surfaceSunken},
  accent: {width: 4, backgroundColor: theme.colors.brand},
  body: {flex: 1},
  padded: {padding: theme.spacing.lg},
});
