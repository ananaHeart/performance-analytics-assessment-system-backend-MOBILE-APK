import React, { useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import type { V3OfflineDiagnosticSnapshot } from '../database/v3/diagnosticRepository';
import type { V3AuthSession } from '../services/v3/authClient';
import { V3LoginFlow } from './V3LoginFlow';
import { Banner, Button, TextField } from './ui';
import { theme } from '../theme/tokens';

/**
 * SES-1: shown when a Send finds the session expired (5 minutes of
 * inactivity). The teacher signs in again right here, without leaving the
 * screen; the send then continues on its own. Saved results stay on the
 * phone whatever happens here, and scanning never needs this.
 */
export const SessionReloginSheet = ({
  visible,
  email,
  onRenewed,
  onCancel,
}: {
  visible: boolean;
  email: string;
  onRenewed: (session: V3AuthSession, snapshot: V3OfflineDiagnosticSnapshot) => void;
  onCancel: () => void;
}): React.JSX.Element => {
  const [password, setPassword] = useState('');
  const [request, setRequest] = useState<{ requestId: number; email: string; password: string } | null>(null);

  const close = () => {
    setPassword('');
    setRequest(null);
    onCancel();
  };

  return (
    <>
      <Modal visible={visible && !request} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Banner
              tone="warning"
              title="Please sign in again to send"
              message="You were signed out after 5 minutes of no activity. Your saved results are safe on this phone and will be sent right after you sign in."
            />
            <TextField label="Email" value={email} editable={false} containerStyle={styles.field} />
            <TextField
              label="Password"
              password
              value={password}
              onChangeText={setPassword}
              autoFocus
              containerStyle={styles.field}
            />
            <Button
              label="Sign in and send"
              fullWidth
              disabled={!password}
              onPress={() => setRequest({ requestId: Date.now(), email, password })}
              style={styles.field}
            />
            <Button label="Not now" variant="link" fullWidth onPress={close} />
          </View>
        </View>
      </Modal>
      {visible && request ? (
        <V3LoginFlow
          key={request.requestId}
          request={request}
          onClose={() => setRequest(null)}
          onAuthenticated={(session, snapshot) => {
            setPassword('');
            setRequest(null);
            onRenewed(session, snapshot);
          }}
        />
      ) : null}
    </>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.lg,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.dialog,
    padding: theme.spacing.lg,
  },
  field: { marginTop: theme.spacing.md },
});
