import React from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';

import { useV3ServerWaking, V3_SERVER_WAKING_MESSAGE } from '../services/v3/coldStartFetch';
import { Banner } from './ui/Banner';

/** Shown only while a V3 request is slow enough to suggest the server is starting up. */
export const V3ServerWakingNotice = ({
  style,
}: {
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element | null => {
  const waking = useV3ServerWaking();
  if (!waking) return null;
  return <Banner tone="warning" busy message={V3_SERVER_WAKING_MESSAGE} style={style} />;
};
