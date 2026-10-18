import React from 'react';
import {StyleSheet, Text, View, type StyleProp, type ViewStyle} from 'react-native';

import {theme} from '../../theme/tokens';

export interface ProgressBarProps {
  current: number;
  total: number;
  label?: string;
  style?: StyleProp<ViewStyle>;
}

export const ProgressBar = ({current, total, label, style}: ProgressBarProps): React.JSX.Element => {
  const fraction = total > 0 ? Math.min(1, Math.max(0, current / total)) : 0;
  return (
    <View
      style={style}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{min: 0, max: Math.max(total, 0), now: Math.min(current, total)}}
    >
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.track}>
        <View style={[styles.fill, {width: `${fraction * 100}%`}]} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  label: {...theme.type.caption, color: theme.colors.muted, marginBottom: 6},
  track: {height: 8, borderRadius: theme.radius.pill, backgroundColor: theme.colors.border, overflow: 'hidden'},
  fill: {height: 8, borderRadius: theme.radius.pill, backgroundColor: theme.colors.primary},
});
