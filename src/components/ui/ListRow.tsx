import React from 'react';
import {Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle} from 'react-native';
import {ChevronRight} from 'lucide-react-native';

import {theme} from '../../theme/tokens';

export interface ListRowProps {
  title: string;
  subtitle?: string | null;
  subtitleColor?: string;
  /** Rendered before the text, e.g. an icon. */
  left?: React.ReactNode;
  /** 'chevron' shows a forward arrow; any node is rendered as-is. */
  right?: React.ReactNode | 'chevron';
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  /**
   * Standalone rows get their own border and radius; rows inside a Card use
   * bordered={false} and a divider between them instead.
   */
  bordered?: boolean;
  divider?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: 'button' | 'link';
  testID?: string;
}

export const ListRow = ({
  title,
  subtitle,
  subtitleColor = theme.colors.muted,
  left,
  right,
  selected = false,
  onPress,
  disabled = false,
  bordered = true,
  divider = false,
  style,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = 'button',
  testID,
}: ListRowProps): React.JSX.Element => {
  const content = (
    <>
      {selected ? <View style={styles.selectedStrip} /> : null}
      {left ? <View style={styles.left}>{left}</View> : null}
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, {color: subtitleColor}]}>{subtitle}</Text> : null}
      </View>
      {right === 'chevron' ? (
        <ChevronRight size={20} color={theme.colors.muted} strokeWidth={2.2} />
      ) : right ? (
        <View style={styles.right}>{right}</View>
      ) : null}
    </>
  );
  const rowStyle = [
    styles.row,
    bordered && styles.bordered,
    divider && styles.divider,
    selected && styles.selected,
  ];
  if (!onPress) {
    return <View style={[rowStyle, style]} testID={testID}>{content}</View>;
  }
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{disabled, selected}}
      testID={testID}
      style={({pressed}) => [rowStyle, pressed && !selected && styles.pressed, style]}
    >
      {content}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
  },
  bordered: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.card,
  },
  divider: {borderTopWidth: 1, borderTopColor: theme.colors.border},
  selected: {backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.primaryBorder},
  pressed: {backgroundColor: theme.colors.surfaceSunken},
  selectedStrip: {position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: theme.colors.brand},
  left: {alignItems: 'center', justifyContent: 'center'},
  copy: {flex: 1},
  title: {...theme.type.bodyStrong, color: theme.colors.text},
  subtitle: {...theme.type.caption, marginTop: 2},
  right: {alignItems: 'flex-end', justifyContent: 'center'},
});
