import React, { useState } from 'react';
import { 
  View, 
  Alert,
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet
} from 'react-native';
import {Eye, GraduationCap} from 'lucide-react-native';
import { testBackendConnection } from '../services/authService';
import { LoginLoading } from './LoginLoading';

interface LoginScreenProps {
  onLogin: (email: string, password: string) => void | Promise<void>;
  onOpenDynamicScanner?: () => void;
  onOpenV3Diagnostics?: () => void;
}

export const LoginScreen = ({
  onLogin,
}: LoginScreenProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // One login per tap: a second tap while the first is still running would
  // send the same credentials again and count twice toward the backend's
  // failed-login tally.
  const handleSubmit = async () => {
    if (isSubmitting) return;
    const normalizedEmail = email.trim();
    if (!normalizedEmail || !password) {
      Alert.alert('Login Required', 'Please enter both email and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onLogin(normalizedEmail, password);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackendTest = async () => {
    const result = await testBackendConnection();
    Alert.alert(
      'Backend Connection Test',
      `Backend URL: ${result.backendUrl}\nHTTP status: ${result.status}\nReachable: ${result.reachable}\nV3 ready: ${result.v3Ready}\nMessage: ${result.message}`,
    );
  };

  if (isSubmitting) return <LoginLoading />;

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.logoCircle}>
          <GraduationCap size={30} color="#2DBE4F" strokeWidth={2.6} />
        </View>

        <Text style={styles.title}>Performance Analytic Assessment System</Text>
        <Text style={styles.subtitle}>Mobile Teacher App</Text>

        <View style={styles.form}>
          <Text style={styles.inputLabel}>Email or Username</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter email or username"
            value={email}
            onChangeText={setEmail}
            placeholderTextColor="#8B99AA"
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <Text style={styles.inputLabel}>Password</Text>
          <View style={styles.passwordInputWrap}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Enter password"
              secureTextEntry={!isPasswordVisible}
              value={password}
              onChangeText={setPassword}
              placeholderTextColor="#8B99AA"
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setIsPasswordVisible((current) => !current)}
              activeOpacity={0.8}
            >
              <Eye size={18} color="#718096" strokeWidth={2.2} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.forgotButton} activeOpacity={0.8}>
            <Text style={styles.forgotText}>Forgot Password?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, isSubmitting && styles.buttonBusy]}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            <Text style={styles.buttonText}>{isSubmitting ? 'Logging in…' : 'Login'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.backendTestLink} onPress={handleBackendTest} activeOpacity={0.8}>
            <Text style={styles.backendTestText}>Test Backend Readiness</Text>
          </TouchableOpacity>

        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
  },
  content: { 
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#E9FBEF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 7,
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    textAlign: 'center',
  },
  form: { 
    width: '100%',
    marginTop: 32,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 7,
    marginLeft: 2,
  },
  input: { 
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    minHeight: 46,
    borderRadius: 8,
    marginBottom: 18,
    fontSize: 14,
    color: '#111827',
    fontWeight: '600',
  },
  passwordInputWrap: {
    minHeight: 46,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 14,
    fontSize: 14,
    color: '#111827',
    fontWeight: '600',
  },
  eyeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  forgotButton: {
    alignSelf: 'flex-end',
    paddingVertical: 6,
    marginBottom: 10,
  },
  forgotText: {
    color: '#22C55E',
    fontSize: 12,
    fontWeight: '700',
  },
  button: { 
    backgroundColor: '#35C94A',
    minHeight: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 0,
    elevation: 3,
    shadowColor: '#35C94A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
  },
  buttonBusy: {
    opacity: 0.6,
  },
  buttonText: { 
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  backendTestLink: {
    alignSelf: 'center',
    marginTop: 28,
    paddingVertical: 6,
  },
  backendTestText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
  },
});
