import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useV3ServerWaking, V3_SERVER_WAKING_MESSAGE } from '../services/v3/coldStartFetch';

/** Shown only while a V3 request is slow enough to suggest the server is starting up. */
export const V3ServerWakingNotice = ({
  style,
}: {
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element | null => {
  const waking = useV3ServerWaking();
  if (!waking) return null;
  return (
    <View style={[styles.notice, style]} accessibilityLiveRegion="polite">
      <ActivityIndicator size="small" color="#92400E" />
      <Text style={styles.text}>{V3_SERVER_WAKING_MESSAGE}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#FFF7E6',
    borderWidth: 1,
    borderColor: '#F5D9A8',
  },
  text: { flex: 1, color: '#92400E', fontWeight: '700', lineHeight: 18 },
});
