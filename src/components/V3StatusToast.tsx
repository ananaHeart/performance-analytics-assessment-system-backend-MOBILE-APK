import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const NOTICE_VISIBLE_MS = 4000;
const FADE_MS = 250;

/**
 * A pop-up shown over the top of the screen, so it is seen wherever the
 * teacher has scrolled (errors used to appear under the student list, where
 * they were easy to miss while waiting).
 *
 * - A notice (message) fades out on its own a few seconds after the work it
 *   describes has finished.
 * - An error stays until the teacher taps Try again (when there is something
 *   to retry) or Dismiss.
 */
export const V3StatusToast = ({
  message,
  error,
  busy,
  onRetry,
  onDismissMessage,
  onDismissError,
}: {
  message: string | null;
  error: string | null;
  busy: boolean;
  onRetry: (() => void) | null;
  onDismissMessage: () => void;
  onDismissError: () => void;
}): React.JSX.Element | null => {
  const opacity = useRef(new Animated.Value(0)).current;
  const text = error ?? message;
  const isError = error !== null;

  useEffect(() => {
    if (!text) return;
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: FADE_MS, useNativeDriver: true }).start();
  }, [opacity, text]);

  useEffect(() => {
    if (isError || !message || busy) return;
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true })
        .start(({ finished }) => {
          if (finished) onDismissMessage();
        });
    }, NOTICE_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [busy, isError, message, onDismissMessage, opacity]);

  if (!text) return null;
  return (
    <Animated.View
      style={[styles.toast, isError ? styles.toastError : styles.toastNotice, { opacity }]}
      accessibilityLiveRegion={isError ? 'assertive' : 'polite'}
    >
      <Text style={[styles.text, isError ? styles.textError : styles.textNotice]}>{text}</Text>
      {isError ? (
        <View style={styles.actions}>
          {onRetry ? (
            <TouchableOpacity style={styles.retryButton} onPress={onRetry} disabled={busy}>
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.dismissButton} onPress={onDismissError}>
            <Text style={styles.dismissText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  toast: {
    marginTop: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    elevation: 6,
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  toastNotice: { backgroundColor: '#E9F9EE', borderColor: '#B7E4C4' },
  toastError: { backgroundColor: '#FFF1F0', borderColor: '#F5B5AE' },
  text: { fontWeight: '800', lineHeight: 18 },
  textNotice: { color: '#166534' },
  textError: { color: '#B42318' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 },
  retryButton: { backgroundColor: '#B42318', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  retryText: { color: '#FFFFFF', fontWeight: '800' },
  dismissButton: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#F5B5AE' },
  dismissText: { color: '#B42318', fontWeight: '800' },
});
