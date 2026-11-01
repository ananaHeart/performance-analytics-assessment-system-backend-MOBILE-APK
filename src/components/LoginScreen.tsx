import React, { useRef, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { theme } from '../theme/tokens';
import { LoginLoading } from './LoginLoading';
import { MarkaMark } from './MarkaMark';
import { Button, TextField, useDialog } from './ui';
import { FORGOT_PASSWORD_URL } from '../config/appInfo';

interface LoginScreenProps {
  onLogin: (email: string, password: string) => void | Promise<void>;
  onOpenDynamicScanner?: () => void;
  onOpenV3Diagnostics?: () => void;
}

export const LoginScreen = ({
  onLogin,
}: LoginScreenProps) => {
  const dialog = useDialog();
  const passwordInput = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // One login per tap: a second tap while the first is still running would
  // send the same credentials again and count twice toward the backend's
  // failed-login tally.
  const handleSubmit = async () => {
    if (isSubmitting) return;
    const normalizedEmail = email.trim();
    if (!normalizedEmail || !password) {
      dialog.info({ title: 'Login Required', message: 'Please enter both email and password.' });
      return;
    }

    setIsSubmitting(true);
    try {
      await onLogin(normalizedEmail, password);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitting) return <LoginLoading />;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.logoCircle}>
          <MarkaMark size={40} />
        </View>

        <Text style={styles.title} accessibilityRole="header">Marka</Text>
        <Text style={styles.subtitle}>Scan, score, and see how every learner is doing.</Text>

        <View style={styles.form}>
          <TextField
            label="Email or Username"
            placeholder="Enter email or username"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="username"
            autoComplete="username"
            returnKeyType="next"
            onSubmitEditing={() => passwordInput.current?.focus()}
            containerStyle={styles.field}
          />
          <TextField
            ref={passwordInput}
            label="Password"
            placeholder="Enter password"
            value={password}
            onChangeText={setPassword}
            password
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
            autoComplete="password"
            returnKeyType="go"
            onSubmitEditing={handleSubmit}
            containerStyle={styles.field}
          />

          <Button
            label={isSubmitting ? 'Logging in…' : 'Login'}
            onPress={handleSubmit}
            loading={isSubmitting}
            fullWidth
            style={styles.button}
          />
          <Button
            label="Forgot password?"
            variant="link"
            fullWidth
            onPress={() => {
              Linking.openURL(FORGOT_PASSWORD_URL).catch(() => dialog.info({
                title: 'Forgot password?',
                message: `Open ${FORGOT_PASSWORD_URL} on any browser to reset your password.`,
              }));
            }}
          />
        </View>

        <Text style={styles.notice}>
          This mobile app is for teachers only.{'\n'}Principals, please use Marka on a computer.
        </Text>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xxl,
    paddingVertical: theme.spacing.xxxl,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.xl,
  },
  title: { ...theme.type.display, color: theme.colors.text, textAlign: 'center' },
  subtitle: { ...theme.type.body, color: theme.colors.muted, textAlign: 'center', marginTop: theme.spacing.xs },
  form: { width: '100%', maxWidth: 420, marginTop: theme.spacing.xxl },
  field: { marginBottom: theme.spacing.lg },
  button: { marginTop: theme.spacing.xs },
  notice: {
    ...theme.type.caption,
    color: theme.colors.muted,
    textAlign: 'center',
    marginTop: theme.spacing.xxl,
  },
});
