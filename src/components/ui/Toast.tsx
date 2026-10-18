import React, {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {Animated, StyleSheet, Text, View} from 'react-native';

import {theme} from '../../theme/tokens';
import {Button} from './Button';

export type ToastVariant = 'notice' | 'error' | 'info';

const NOTICE_VISIBLE_MS = 4000;
const FADE_MS = 250;

const PALETTES = {
  notice: theme.status.success,
  error: theme.status.danger,
  info: theme.status.info,
} as const;

export interface ToastProps {
  variant: ToastVariant;
  message: string | null;
  /** While the work a notice describes is still running, it stays up. */
  busy?: boolean;
  /** Errors only: adds "Try again". */
  onRetry?: (() => void) | null;
  onDismiss: () => void;
}

/**
 * A pop-up over the top of the screen, so it's seen wherever the teacher has
 * scrolled.
 * - A notice or info message fades out on its own a few seconds after the work
 *   it describes has finished.
 * - An error stays until the teacher taps Try again (when there is something
 *   to retry) or Dismiss.
 */
export const Toast = ({variant, message, busy = false, onRetry, onDismiss}: ToastProps): React.JSX.Element | null => {
  const opacity = useRef(new Animated.Value(0)).current;
  const isError = variant === 'error';

  useEffect(() => {
    if (!message) return;
    opacity.setValue(0);
    Animated.timing(opacity, {toValue: 1, duration: FADE_MS, useNativeDriver: true}).start();
  }, [opacity, message]);

  useEffect(() => {
    if (isError || !message || busy) return;
    const timer = setTimeout(() => {
      Animated.timing(opacity, {toValue: 0, duration: FADE_MS, useNativeDriver: true})
        .start(({finished}) => {
          if (finished) onDismiss();
        });
    }, NOTICE_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [busy, isError, message, onDismiss, opacity]);

  if (!message) return null;
  const palette = PALETTES[variant];
  return (
    <Animated.View
      style={[styles.toast, {backgroundColor: palette.soft, borderColor: palette.border, opacity}]}
      accessibilityLiveRegion={isError ? 'assertive' : 'polite'}
    >
      <Text style={[styles.text, {color: palette.text}]}>{message}</Text>
      {isError ? (
        <View style={styles.actions}>
          {onRetry ? <Button label="Try again" variant="danger" onPress={onRetry} disabled={busy} /> : null}
          <Button label="Dismiss" variant="secondary" onPress={onDismiss} />
        </View>
      ) : null}
    </Animated.View>
  );
};

export interface ToastRequest {
  variant: ToastVariant;
  message: string;
  onRetry?: () => void;
}

const ToastContext = createContext<(request: ToastRequest) => void>(() => undefined);

/** Lets any screen show a Toast with `useToast()`; it floats at the top of the app. */
export const ToastProvider = ({children}: {children: React.ReactNode}): React.JSX.Element => {
  const [toast, setToast] = useState<ToastRequest | null>(null);
  const dismiss = useCallback(() => setToast(null), []);
  const retry = useMemo(() => (toast?.onRetry
    ? () => {
        const run = toast.onRetry;
        setToast(null);
        run?.();
      }
    : null), [toast]);
  return (
    <ToastContext.Provider value={setToast}>
      {children}
      <View style={styles.host} pointerEvents="box-none">
        <Toast
          variant={toast?.variant ?? 'notice'}
          message={toast?.message ?? null}
          onRetry={retry}
          onDismiss={dismiss}
        />
      </View>
    </ToastContext.Provider>
  );
};

export const useToast = (): ((request: ToastRequest) => void) => useContext(ToastContext);

const styles = StyleSheet.create({
  toast: {
    marginTop: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    elevation: theme.elevation.toast,
    shadowColor: theme.colors.shadow,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 3},
  },
  text: {...theme.type.bodyStrong},
  actions: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: theme.spacing.sm, marginTop: theme.spacing.md},
  host: {position: 'absolute', top: 0, left: theme.screenPadding, right: theme.screenPadding},
});
