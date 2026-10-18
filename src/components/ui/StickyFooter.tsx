import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {theme} from '../../theme/tokens';

/**
 * The action bar at the bottom of a full-screen modal. It sits below the
 * scrolling content (not over it), so a tall footer never hides the last
 * items; the screen's white SafeAreaView continues it into the gesture area.
 */
export const StickyFooter = ({
  hint,
  children,
}: {
  hint?: string | null;
  children: React.ReactNode;
}): React.JSX.Element => (
  <View style={styles.footer}>
    {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    {children}
  </View>
);

/** Lays its buttons out side by side; give each one `style={{flex: 1}}`. */
export const FooterRow = ({children}: {children: React.ReactNode}): React.JSX.Element => (
  <View style={styles.row}>{children}</View>
);

const styles = StyleSheet.create({
  footer: {
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingHorizontal: theme.screenPadding,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.sm,
    elevation: theme.elevation.stickyFooter,
    shadowColor: theme.colors.shadow,
    shadowOffset: {width: 0, height: -2},
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  hint: {...theme.type.caption, color: theme.status.warning.text, textAlign: 'center'},
  row: {flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm},
});
