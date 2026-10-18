import React, {useEffect, useRef} from 'react';
import {ActivityIndicator, Animated, StyleSheet, Text, View, type StyleProp, type ViewStyle} from 'react-native';

import {theme} from '../../theme/tokens';

export const LoadingState = ({
  message,
  style,
}: {
  message?: string;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element => (
  <View style={[styles.loading, style]} accessibilityState={{busy: true}}>
    <ActivityIndicator size="large" color={theme.colors.primary} />
    {message ? <Text style={styles.message} accessibilityLiveRegion="polite">{message}</Text> : null}
  </View>
);

/** A placeholder in the shape of a ListRow, shown while a list loads for the first time. */
export const SkeletonRow = ({style}: {style?: StyleProp<ViewStyle>}): React.JSX.Element => {
  const opacity = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(opacity, {toValue: 1, duration: 700, useNativeDriver: true}),
      Animated.timing(opacity, {toValue: 0.5, duration: 700, useNativeDriver: true}),
    ]));
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);
  return (
    <View style={[styles.row, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[styles.copy, {opacity}]}>
        <View style={[styles.bar, styles.barTitle]} />
        <View style={[styles.bar, styles.barSubtitle]} />
      </Animated.View>
      <Animated.View style={[styles.bar, styles.barBadge, {opacity}]} />
    </View>
  );
};

export const SkeletonList = ({count = 3}: {count?: number}): React.JSX.Element => (
  <View style={styles.list} accessibilityLabel="Loading" accessibilityState={{busy: true}}>
    {Array.from({length: count}, (_, index) => <SkeletonRow key={index} />)}
  </View>
);

const styles = StyleSheet.create({
  loading: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.lg, padding: theme.spacing.xxl},
  message: {...theme.type.body, color: theme.colors.muted, textAlign: 'center'},
  list: {gap: theme.spacing.sm},
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.card,
  },
  copy: {flex: 1, gap: theme.spacing.sm},
  bar: {backgroundColor: theme.colors.surfaceSunken, borderRadius: theme.radius.control},
  barTitle: {height: 14, width: '60%'},
  barSubtitle: {height: 10, width: '40%'},
  barBadge: {height: 24, width: 64, borderRadius: theme.radius.pill},
});
