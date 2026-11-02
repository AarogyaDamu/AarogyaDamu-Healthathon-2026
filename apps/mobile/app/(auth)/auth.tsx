
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import {
  getSelectedMobileRole,
  mobileApiFetch,
  saveMobileToken,
  setSelectedMobileRole,
} from '../../src/api/client';

type AuthMode = 'LOGIN' | 'REGISTER';
type SelectedMobileRole = 'PATIENT' | 'CAREGIVER';

interface AuthResponse {
  token: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    isSyntheticDemo?: boolean;
    isClinician?: boolean;
  };
  profile?: {
    fullName?: string;
  } | null;
}

export default function AuthScreen() {
  const params = useLocalSearchParams<{ mode?: string; role?: string }>();
  const initialMode: AuthMode = params.mode === 'signup' ? 'REGISTER' : 'LOGIN';
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [selectedRole, setSelectedRole] = useState<SelectedMobileRole>('PATIENT');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const nextRole = params.role === 'CAREGIVER' ? 'CAREGIVER' : 'PATIENT';
    setSelectedRole(nextRole);
    void setSelectedMobileRole(nextRole);
  }, [params.role]);

  useEffect(() => {
    void getSelectedMobileRole().then((role) => {
      if (role === 'CAREGIVER' || role === 'PATIENT') {
        setSelectedRole(role);
      }
    });
  }, []);

  const isRegister = mode === 'REGISTER';

  async function handleSubmit() {
    setError('');

    const normalizedEmail = email.trim().toLowerCase();

    if (isRegister && fullName.trim().length < 2) {
      setError('Enter your full name.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Enter a valid email address.');
      return;
    }

    if (isRegister && password.length < 8) {
      setError('Create a password with at least 8 characters.');
      return;
    }

    if (!isRegister && !password) {
      setError('Enter your password.');
      return;
    }

    setLoading(true);

    try {
      const path = isRegister ? '/auth/register' : '/auth/login';

      const payload = isRegister
        ? {
            email: normalizedEmail,
            password,
            fullName: fullName.trim(),
            role: selectedRole,
          }
        : {
            email: normalizedEmail,
            password,
          };

      const result = await mobileApiFetch<AuthResponse>(path, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!result?.token || !result.refreshToken || !result.user?.id) {
        throw new Error('The server returned an incomplete login response.');
      }

      await saveMobileToken(result.token, result.refreshToken);
      await setSelectedMobileRole(selectedRole);

      // Do not choose a workspace from a user-controlled role field.
      // The session router checks the authenticated server context.
      router.replace('/session-router');
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Unable to authenticate. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  function changeMode(nextMode: AuthMode) {
    setError('');
    setMode(nextMode);
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandMark}>
          <Text style={styles.brandLetter}>A</Text>
        </View>

        <Text style={styles.brandName}>AarogyaDamu</Text>
        <Text style={styles.brandSubtitle}>
          Your diabetes care journey, connected.
        </Text>

        <View style={styles.card}>
          <Text style={styles.eyebrow}>YOUR HEALTH, YOUR JOURNEY</Text>
          <Text style={styles.heading}>
            {isRegister ? 'Create your account' : 'Welcome back'}
          </Text>
          <Text style={styles.description}>
            {isRegister
              ? 'Create an account to organize your health information and care.'
              : 'Sign in to continue to your personal health workspace.'}
          </Text>

          <View style={styles.modeSwitch}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ selected: !isRegister }}
              onPress={() => changeMode('LOGIN')}
              style={[
                styles.modeButton,
                !isRegister && styles.modeButtonActive,
              ]}
            >
              <Text
                style={[
                  styles.modeButtonText,
                  !isRegister && styles.modeButtonTextActive,
                ]}
              >
                Sign in
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ selected: isRegister }}
              onPress={() => changeMode('REGISTER')}
              style={[
                styles.modeButton,
                isRegister && styles.modeButtonActive,
              ]}
            >
              <Text
                style={[
                  styles.modeButtonText,
                  isRegister && styles.modeButtonTextActive,
                ]}
              >
                Create account
              </Text>
            </TouchableOpacity>
          </View>

          {isRegister && (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Full name</Text>
              <TextInput
                value={fullName}
                onChangeText={setFullName}
                placeholder="Enter your full name"
                placeholderTextColor="#94A3B8"
                autoCapitalize="words"
                autoCorrect={false}
                textContentType="name"
                accessibilityLabel="Full name"
                editable={!loading}
                style={styles.input}
                returnKeyType="next"
              />
            </View>
          )}

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Email address</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor="#94A3B8"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="emailAddress"
              accessibilityLabel="Email address"
              editable={!loading}
              style={styles.input}
              returnKeyType="next"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Password</Text>

            <View style={styles.passwordWrapper}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder={
                  isRegister ? 'At least 8 characters' : 'Enter your password'
                }
                placeholderTextColor="#94A3B8"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType={
                  isRegister ? 'newPassword' : 'password'
                }
                accessibilityLabel="Password"
                editable={!loading}
                style={styles.passwordInput}
                returnKeyType="go"
                onSubmitEditing={() => void handleSubmit()}
              />

              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={
                  showPassword ? 'Hide password' : 'Show password'
                }
                disabled={loading}
                onPress={() => setShowPassword((value) => !value)}
                style={styles.passwordToggle}
              >
                <Text style={styles.passwordToggleText}>
                  {showPassword ? 'Hide' : 'Show'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {error ? (
            <View accessibilityRole="alert" style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            accessibilityRole="button"
            disabled={loading}
            onPress={() => void handleSubmit()}
            activeOpacity={0.85}
            style={[styles.submitButton, loading && styles.buttonDisabled]}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>
                {isRegister ? 'Create account' : 'Sign in securely'}
              </Text>
            )}
          </TouchableOpacity>

          <Text style={styles.footnote}>
            {selectedRole === 'CAREGIVER'
              ? 'You are continuing as a caregiver for the selected account.'
              : 'You are continuing as a patient for the selected account.'}
          </Text>
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          disabled={loading}
          onPress={() => router.replace('/(auth)/welcome')}
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>Back to welcome</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 36,
  },
  brandMark: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: '#EA580C',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 12,
  },
  brandLetter: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 28,
  },
  brandName: {
    color: '#0F172A',
    fontSize: 26,
    fontWeight: '900',
    textAlign: 'center',
  },
  brandSubtitle: {
    color: '#64748B',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 7,
    marginBottom: 26,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    borderRadius: 22,
    padding: 20,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  eyebrow: {
    color: '#C2410C',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  heading: {
    color: '#0F172A',
    fontSize: 25,
    fontWeight: '900',
    marginTop: 8,
  },
  description: {
    color: '#64748B',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 7,
  },
  modeSwitch: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 4,
    marginTop: 22,
    marginBottom: 18,
  },
  modeButton: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 11,
    borderRadius: 9,
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: '#FFFFFF',
    elevation: 1,
  },
  modeButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  modeButtonTextActive: {
    color: '#C2410C',
  },
  fieldGroup: {
    marginTop: 11,
    gap: 7,
  },
  label: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '800',
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    color: '#0F172A',
    borderRadius: 11,
    paddingHorizontal: 13,
    fontSize: 14,
  },
  passwordWrapper: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
  },
  passwordInput: {
    flex: 1,
    minHeight: 46,
    paddingHorizontal: 13,
    color: '#0F172A',
    fontSize: 14,
  },
  passwordToggle: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 13,
  },
  passwordToggleText: {
    color: '#C2410C',
    fontWeight: '800',
    fontSize: 12,
  },
  errorBox: {
    marginTop: 14,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    padding: 12,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 12,
    lineHeight: 18,
  },
  submitButton: {
    minHeight: 49,
    borderRadius: 12,
    backgroundColor: '#EA580C',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    paddingHorizontal: 16,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  footnote: {
    marginTop: 14,
    fontSize: 11,
    lineHeight: 17,
    color: '#64748B',
    textAlign: 'center',
  },
  demoSection: {
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  demoSectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.8,
    textAlign: 'center',
    marginBottom: 8,
  },
  demoRoleButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoDoctorButton: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
  },
  demoDoctorText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '800',
  },
  demoRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  demoHalfButton: {
    flex: 1,
  },
  demoPatientButton: {
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#CCFBF1',
  },
  demoPatientText: {
    color: '#0F766E',
    fontSize: 11,
    fontWeight: '800',
  },
  demoCaregiverButton: {
    backgroundColor: '#FAF5FF',
    borderWidth: 1,
    borderColor: '#F3E8FF',
  },
  demoCaregiverText: {
    color: '#7E22CE',
    fontSize: 11,
    fontWeight: '800',
  },
  backButton: {
    alignSelf: 'center',
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  backButtonText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '700',
  },
});
