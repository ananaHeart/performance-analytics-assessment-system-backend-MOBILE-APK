import React, {useEffect, useRef, useState} from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Modal,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';

import {theme} from '../theme/tokens';

const SWEEP_MS = 1400;
const LINE_HEIGHT = 3;
// Glow bands above and below the scan line, strongest next to it.
const GLOW_BANDS = [0.32, 0.18, 0.1, 0.05];
const GLOW_BAND_HEIGHT = 8;
const BRACKET_SIZE = 28;
const BRACKET_THICKNESS = 3;
const FALLBACK_ASPECT = 3 / 4;

/** The largest width x height with this aspect ratio that fits the area. */
const fit = (aspect: number, area: {width: number; height: number}) => {
  const width = Math.min(area.width, area.height * aspect);
  return {width, height: width / aspect};
};

const Glow = ({side}: {side: 'above' | 'below'}) => (
  <View style={side === 'above' ? styles.glowAbove : styles.glowBelow} pointerEvents="none">
    {(side === 'above' ? [...GLOW_BANDS].reverse() : GLOW_BANDS).map((opacity, index) => (
      <View key={index} style={[styles.glowBand, {opacity}]} />
    ))}
  </View>
);

/**
 * Shown while a just-taken photo is being checked: the photo itself with a
 * scan line sweeping over it. Display only - detection runs natively in the
 * background and this closes as soon as its result (or error) arrives.
 */
export const ScanningOverlay = ({photoUri}: {photoUri: string | null}): React.JSX.Element => {
  const [aspect, setAspect] = useState(FALLBACK_ASPECT);
  const [area, setArea] = useState<{width: number; height: number} | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const sweep = useRef(new Animated.Value(0)).current;
  const dots = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!photoUri) return;
    let active = true;
    Image.getSize(
      photoUri,
      (width, height) => { if (active && width > 0 && height > 0) setAspect(width / height); },
      () => undefined,
    );
    AccessibilityInfo.isReduceMotionEnabled()
      .then(enabled => { if (active) setReduceMotion(enabled); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [photoUri]);

  useEffect(() => {
    if (!photoUri || reduceMotion) return;
    sweep.setValue(0);
    const easing = Easing.inOut(Easing.quad);
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(sweep, {toValue: 1, duration: SWEEP_MS, easing, useNativeDriver: true}),
      Animated.timing(sweep, {toValue: 0, duration: SWEEP_MS, easing, useNativeDriver: true}),
    ]));
    const dotLoop = Animated.loop(
      Animated.timing(dots, {toValue: 3, duration: 1200, easing: Easing.linear, useNativeDriver: true}),
    );
    loop.start();
    dotLoop.start();
    return () => {
      loop.stop();
      dotLoop.stop();
    };
  }, [photoUri, reduceMotion, sweep, dots]);

  const frame = area ? fit(aspect, area) : null;
  const onAreaLayout = (event: LayoutChangeEvent) => {
    const {width, height} = event.nativeEvent.layout;
    setArea({width, height});
  };

  return (
    <Modal visible={photoUri !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={() => undefined}>
      <View
        style={styles.backdrop}
        accessible
        accessibilityLabel="Reading the answer sheet. Please wait."
        accessibilityLiveRegion="polite"
      >
        <View style={styles.frameArea} onLayout={onAreaLayout}>
          {frame && photoUri ? (
            <View style={{width: frame.width, height: frame.height}}>
              <View style={styles.photoClip}>
                <Image source={{uri: photoUri}} style={styles.photo} resizeMode="cover" resizeMethod="resize" />
                <View style={styles.photoDim} />
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.scanLineTrack,
                    {
                      transform: [{
                        translateY: reduceMotion
                          ? frame.height / 2
                          : sweep.interpolate({inputRange: [0, 1], outputRange: [0, frame.height - LINE_HEIGHT]}),
                      }],
                    },
                  ]}
                >
                  <Glow side="above" />
                  <View style={styles.scanLine} />
                  <Glow side="below" />
                </Animated.View>
              </View>
              <View style={[styles.bracket, styles.bracketTopLeft]} />
              <View style={[styles.bracket, styles.bracketTopRight]} />
              <View style={[styles.bracket, styles.bracketBottomLeft]} />
              <View style={[styles.bracket, styles.bracketBottomRight]} />
            </View>
          ) : null}
        </View>

        <View style={styles.caption}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Reading the answer sheet</Text>
            <View style={styles.dots}>
              {[0, 1, 2].map(index => (
                <Animated.View
                  key={index}
                  style={[
                    styles.dot,
                    reduceMotion ? null : {
                      opacity: dots.interpolate({
                        inputRange: [0, index, index + 0.5, index + 1, 3],
                        outputRange: [0.3, 0.3, 1, 0.3, 0.3],
                        extrapolate: 'clamp',
                      }),
                    },
                  ]}
                />
              ))}
            </View>
          </View>
          <Text style={styles.subtitle}>
            Finding the corner markers and the QR code, then checking each answer.
          </Text>
        </View>
      </View>
    </Modal>
  );
};

const {colors, spacing} = theme;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.scanBackdrop,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xxxl + spacing.xxl,
    paddingBottom: spacing.xxxl,
  },
  frameArea: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.sm},
  photoClip: {flex: 1, borderRadius: theme.radius.control, overflow: 'hidden'},
  photo: {width: '100%', height: '100%'},
  photoDim: {...StyleSheet.absoluteFillObject, backgroundColor: colors.scanPhotoDim},
  scanLineTrack: {position: 'absolute', left: 0, right: 0, top: 0, height: LINE_HEIGHT},
  scanLine: {height: LINE_HEIGHT, backgroundColor: colors.brand},
  glowAbove: {position: 'absolute', left: 0, right: 0, bottom: LINE_HEIGHT},
  glowBelow: {position: 'absolute', left: 0, right: 0, top: LINE_HEIGHT},
  glowBand: {height: GLOW_BAND_HEIGHT, backgroundColor: colors.brand},
  bracket: {position: 'absolute', width: BRACKET_SIZE, height: BRACKET_SIZE, borderColor: colors.brand},
  bracketTopLeft: {top: -spacing.sm, left: -spacing.sm, borderTopWidth: BRACKET_THICKNESS, borderLeftWidth: BRACKET_THICKNESS, borderTopLeftRadius: 6},
  bracketTopRight: {top: -spacing.sm, right: -spacing.sm, borderTopWidth: BRACKET_THICKNESS, borderRightWidth: BRACKET_THICKNESS, borderTopRightRadius: 6},
  bracketBottomLeft: {bottom: -spacing.sm, left: -spacing.sm, borderBottomWidth: BRACKET_THICKNESS, borderLeftWidth: BRACKET_THICKNESS, borderBottomLeftRadius: 6},
  bracketBottomRight: {bottom: -spacing.sm, right: -spacing.sm, borderBottomWidth: BRACKET_THICKNESS, borderRightWidth: BRACKET_THICKNESS, borderBottomRightRadius: 6},
  caption: {alignItems: 'center', marginTop: spacing.xxl, gap: spacing.sm},
  titleRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  title: {...theme.type.title, color: colors.onPrimary, textAlign: 'center'},
  dots: {flexDirection: 'row', gap: 5, paddingTop: 4},
  dot: {width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand},
  subtitle: {...theme.type.body, color: colors.faint, textAlign: 'center'},
});
