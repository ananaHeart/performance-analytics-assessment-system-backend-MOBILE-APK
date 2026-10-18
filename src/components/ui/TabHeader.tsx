import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {theme} from '../../theme/tokens';

export interface TabHeaderProps {
  title: string;
  subtitle?: string;
  /** Right-hand slot, e.g. a refresh IconButton. */
  right?: React.ReactNode;
}

/** The large title at the top of the Classes, Synchronization and Profile tabs. */
export const TabHeader = ({title, subtitle, right}: TabHeaderProps): React.JSX.Element => (
  <View style={styles.header}>
    <View style={styles.copy}>
      <Text style={styles.title} accessibilityRole="header">{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
    {right ? <View style={styles.right}>{right}</View> : null}
  </View>
);

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: theme.screenPadding,
    paddingRight: theme.spacing.xs,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  copy: {flex: 1, paddingVertical: theme.spacing.xs},
  title: {...theme.type.display, color: theme.colors.text},
  subtitle: {...theme.type.caption, color: theme.colors.muted, marginTop: 2},
  right: {flexDirection: 'row', alignItems: 'center', marginLeft: theme.spacing.sm},
});
