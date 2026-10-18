import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import type {LucideIcon} from 'lucide-react-native';

import {theme} from '../../theme/tokens';

export interface TabBarItem<Key extends string> {
  key: Key;
  label: string;
  icon: LucideIcon;
}

export interface TabBarProps<Key extends string> {
  tabs: TabBarItem<Key>[];
  activeKey: Key;
  onChange: (key: Key) => void;
}

/**
 * The bottom tabs. The screen's SafeAreaView already pads for the gesture
 * area, and its white background continues the bar into that inset.
 */
export const TabBar = <Key extends string>({
  tabs,
  activeKey,
  onChange,
}: TabBarProps<Key>): React.JSX.Element => (
  <View style={styles.bar} accessibilityRole="tablist">
    {tabs.map(({key, label, icon: Icon}) => {
      const active = key === activeKey;
      const color = active ? theme.colors.primary : theme.colors.muted;
      return (
        <Pressable
          key={key}
          onPress={() => onChange(key)}
          accessibilityRole="tab"
          accessibilityLabel={label}
          accessibilityState={{selected: active}}
          style={({pressed}) => [styles.tab, pressed && styles.pressed]}
        >
          <View style={[styles.activeBar, active && styles.activeBarOn]} />
          <Icon size={theme.iconSize.regular} color={color} strokeWidth={2.2} />
          <Text style={[styles.label, {color}]}>{label}</Text>
        </Pressable>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  tab: {
    flex: 1,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xs,
  },
  pressed: {backgroundColor: theme.colors.surfaceSunken},
  activeBar: {position: 'absolute', top: 0, left: theme.spacing.lg, right: theme.spacing.lg, height: 3, borderRadius: 2},
  activeBarOn: {backgroundColor: theme.colors.brand},
  label: {...theme.type.label, textAlign: 'center'},
});
