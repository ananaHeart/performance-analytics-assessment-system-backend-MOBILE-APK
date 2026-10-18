import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useV3ServerWaking, V3_SERVER_WAKING_MESSAGE } from '../services/v3/coldStartFetch';
import { theme } from '../theme/tokens';
import { MarkaMark } from './MarkaMark';

export const LoginLoading = (): React.JSX.Element => {
  const waking = useV3ServerWaking();
  return (
    <View style={styles.container} accessibilityLabel="Signing in" accessibilityState={{ busy: true }}>
      <View style={styles.logoCircle}>
        <MarkaMark size={40} />
      </View>
      <ActivityIndicator size="large" color={theme.colors.primary} />
      <Text style={styles.text} accessibilityLiveRegion="polite">
        {waking ? V3_SERVER_WAKING_MESSAGE : 'Loading...'}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    gap: theme.spacing.xl,
    paddingHorizontal: theme.spacing.xxxl,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { ...theme.type.body, color: theme.colors.muted, textAlign: 'center' },
});
