import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {theme} from '../../theme/tokens';

export const initialsOf = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0].charAt(0);
  const last = words.length > 1 ? words[words.length - 1].charAt(0) : '';
  return `${first}${last}`.toUpperCase();
};

export const Avatar = ({name}: {name: string}): React.JSX.Element => (
  <View style={styles.circle} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Text style={styles.initials}>{initialsOf(name)}</Text>
  </View>
);

const styles = StyleSheet.create({
  circle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {...theme.type.avatar, color: theme.colors.primary},
});
