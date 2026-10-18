import React, {createContext, useCallback, useContext, useMemo, useState} from 'react';
import {Alert, Modal, StyleSheet, Text, View} from 'react-native';

import {theme} from '../../theme/tokens';
import {Button} from './Button';

const DialogFrame = ({
  visible,
  title,
  message,
  onRequestClose,
  children,
}: {
  visible: boolean;
  title: string;
  message?: string;
  onRequestClose: () => void;
  children: React.ReactNode;
}) => (
  <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onRequestClose}>
    <View style={styles.backdrop}>
      <View style={styles.card} accessibilityViewIsModal accessibilityRole="alert">
        <Text style={styles.title} accessibilityRole="header">{title}</Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <View style={styles.actions}>{children}</View>
      </View>
    </View>
  </Modal>
);

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Makes the confirm button red, for actions that delete something. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** A two-button dialog. The Android back button cancels. */
export const ConfirmDialog = ({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): React.JSX.Element => (
  <DialogFrame visible={visible} title={title} message={message} onRequestClose={onCancel}>
    <Button label={cancelLabel} variant="secondary" onPress={onCancel} />
    <Button label={confirmLabel} variant={destructive ? 'danger' : 'primary'} onPress={onConfirm} />
  </DialogFrame>
);

export interface InfoDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  okLabel?: string;
  onClose: () => void;
}

export const InfoDialog = ({visible, title, message, okLabel = 'OK', onClose}: InfoDialogProps): React.JSX.Element => (
  <DialogFrame visible={visible} title={title} message={message} onRequestClose={onClose}>
    <Button label={okLabel} variant="primary" onPress={onClose} />
  </DialogFrame>
);

export interface ConfirmRequest {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}

export interface InfoRequest {
  title: string;
  message?: string;
  okLabel?: string;
  onClose?: () => void;
}

export interface DialogApi {
  confirm: (request: ConfirmRequest) => void;
  info: (request: InfoRequest) => void;
}

// Outside a DialogProvider (e.g. a component rendered on its own in a test),
// fall back to the system dialog with the same words.
const systemDialogs: DialogApi = {
  confirm: ({title, message, confirmLabel, cancelLabel = 'Cancel', destructive, onConfirm, onCancel}) => {
    Alert.alert(title, message, [
      {text: cancelLabel, style: 'cancel', ...(onCancel ? {onPress: onCancel} : {})},
      {text: confirmLabel, style: destructive ? 'destructive' : 'default', ...(onConfirm ? {onPress: onConfirm} : {})},
    ]);
  },
  info: ({title, message, okLabel = 'OK', onClose}) => {
    Alert.alert(title, message, [{text: okLabel, ...(onClose ? {onPress: onClose} : {})}]);
  },
};

const DialogContext = createContext<DialogApi>(systemDialogs);

type QueuedDialog =
  | ({kind: 'confirm'; id: number} & ConfirmRequest)
  | ({kind: 'info'; id: number} & InfoRequest);

let nextDialogId = 1;

/**
 * Shows Marka-style dialogs requested with `useDialog()`, one at a time in the
 * order they were asked for. Its Modal opens above any screen-level Modal.
 */
export const DialogProvider = ({children}: {children: React.ReactNode}): React.JSX.Element => {
  const [queue, setQueue] = useState<QueuedDialog[]>([]);
  const current = queue[0] ?? null;
  const close = useCallback((id: number, callback?: () => void) => {
    setQueue(previous => previous.filter(item => item.id !== id));
    callback?.();
  }, []);
  const api = useMemo<DialogApi>(() => ({
    confirm: request => setQueue(previous => [...previous, {...request, kind: 'confirm', id: nextDialogId++}]),
    info: request => setQueue(previous => [...previous, {...request, kind: 'info', id: nextDialogId++}]),
  }), []);
  return (
    <DialogContext.Provider value={api}>
      {children}
      {current?.kind === 'confirm' ? (
        <ConfirmDialog
          key={current.id}
          visible
          title={current.title}
          message={current.message}
          confirmLabel={current.confirmLabel}
          cancelLabel={current.cancelLabel}
          destructive={current.destructive}
          onConfirm={() => close(current.id, current.onConfirm)}
          onCancel={() => close(current.id, current.onCancel)}
        />
      ) : current?.kind === 'info' ? (
        <InfoDialog
          key={current.id}
          visible
          title={current.title}
          message={current.message}
          okLabel={current.okLabel}
          onClose={() => close(current.id, current.onClose)}
        />
      ) : null}
    </DialogContext.Provider>
  );
};

export const useDialog = (): DialogApi => useContext(DialogContext);

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: theme.colors.backdrop,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xxl,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.dialog,
    padding: theme.spacing.xl,
    elevation: theme.elevation.dialog,
    shadowColor: theme.colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: {width: 0, height: 8},
  },
  title: {...theme.type.dialogTitle, color: theme.colors.text},
  message: {...theme.type.body, color: theme.colors.textSecondary, marginTop: theme.spacing.sm},
  // Right-aligned in a row; wraps (stacks) when large text makes them too wide.
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xl,
  },
});
