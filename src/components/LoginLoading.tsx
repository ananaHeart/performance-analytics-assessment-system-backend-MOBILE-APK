import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useV3ServerWaking, V3_SERVER_WAKING_MESSAGE } from '../services/v3/coldStartFetch';

export const LoginLoading = (): React.JSX.Element => {
  const waking = useV3ServerWaking();
  return (
    <View style={styles.container} accessibilityLabel="Signing in" accessibilityState={{ busy: true }}>
      <ActivityIndicator size="large" color="#20B94B" />
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
    backgroundColor: '#FFFFFF',
    gap: 16,
  },
  text: { fontSize: 15, fontWeight: '600', color: '#43515C', textAlign: 'center', paddingHorizontal: 32 },
});
