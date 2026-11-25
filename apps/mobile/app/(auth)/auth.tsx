
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
          <Image
            source={require('../../assets/brand/mark_primary_gradient_512.png')}
            style={styles.brandMarkImage}
            resizeMode="contain"
            accessibilityLabel="AarogyaDamu Official Brand Mark"
          />
        </View>

        <Text style={styles.brandName}>AarogyaDamu</Text>
        <Text style={styles.brandSubtitle}>
          Smarter Care. Connected.
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
    backgroundColor: '#F8F9FC',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 32,
  },
  brandMark: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: '#E6F8EF',
    borderWidth: 1.5,
    borderColor: 'rgba(0, 77, 77, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 12,
    shadowColor: '#004D4D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  brandMarkImage: {
    width: 48,
    height: 48,
  },
  brandName: {
    color: '#004D4D',
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    fontFamily: Platform.OS === 'web' ? 'Inter, sans-serif' : undefined,
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    color: '#434653',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 24,
    fontFamily: Platform.OS === 'web' ? 'Inter, sans-serif' : undefined,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(0, 77, 77, 0.1)',
    borderWidth: 1.5,
    borderRadius: 24,
    padding: 22,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    shadowColor: '#191C20',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 2,
  },
  eyebrow: {
    color: '#0E7C7B',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
    fontFamily: Platform.OS === 'web' ? 'Inter, sans-serif' : undefined,
  },
  heading: {
    color: '#191C20',
    fontSize: 24,
    fontWeight: '800',
    marginTop: 6,
    fontFamily: Platform.OS === 'web' ? 'Inter, sans-serif' : undefined,
  },
  description: {
    color: '#434653',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
    fontFamily: Platform.OS === 'web' ? 'Inter, sans-serif' : undefined,
  },
  modeSwitch: {
    flexDirection: 'row',
    backgroundColor: '#ECEEF3',
    borderRadius: 14,
    padding: 4,
    marginTop: 20,
    marginBottom: 16,
  },
  modeButton: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  modeButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#434653',
    fontFamily: Platform.OS === 'web' ? 'Inter, sans-serif' : undefined,
  },
  modeButtonTextActive: {
    color: '#004D4D',
    fontWeight: '800',
  },
  fieldGroup: {
    marginTop: 12,
    gap: 6,
  },
  label: {
    color: '#191C20',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontFamily: Platform.OS === 'web' ? 'Inter, sans-serif' : undefined,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: 'rgba(0, 77, 77, 0.12)',
    backgroundColor: '#F2F3F9',
    color: '#191C20',
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 14,
    fontFamily: Platform.OS === 'web' ? 'Inter, sans-serif' : undefined,
  },
  passwordWrapper: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 77, 77, 0.12)',
    borderRadius: 12,
    backgroundColor: '#F2F3F9',
  },
  passwordInput: {
    flex: 1,
    minHeight: 46,
    paddingHorizontal: 14,
    color: '#191C20',
    fontSize: 14,
    fontFamily: Platform.OS === 'web' ? 'Inter, sans-serif' : undefined,
  },
  passwordToggle: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  passwordToggleText: {
    color: '#0E7C7B',
    fontWeight: '800',
    fontSize: 12,
  },
  errorBox: {
    marginTop: 14,
    backgroundColor: '#FFDAD6',
    borderWidth: 1,
    borderColor: '#BA1A1A',
    borderRadius: 12,
    padding: 12,
  },
  errorText: {
    color: '#BA1A1A',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  submitButton: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: '#004D4D',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    paddingHorizontal: 16,
    shadowColor: '#004D4D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 3,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    fontFamily: Platform.OS === 'web' ? 'Inter, sans-serif' : undefined,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  footnote: {
    marginTop: 14,
    fontSize: 11,
    lineHeight: 17,
    color: '#434653',
    textAlign: 'center',
    fontFamily: Platform.OS === 'web' ? 'Inter, sans-serif' : undefined,
  },
  demoSection: {
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#ECEEF3',
  },
  demoSectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#434653',
    letterSpacing: 0.8,
    textAlign: 'center',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  demoRoleButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoDoctorButton: {
    backgroundColor: '#191C20',
    borderWidth: 1,
    borderColor: '#434653',
  },
  demoDoctorText: {
    color: '#A7E6C3',
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
    backgroundColor: 'rgba(0, 77, 77, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0, 77, 77, 0.2)',
  },
  demoPatientText: {
    color: '#004D4D',
    fontSize: 11,
    fontWeight: '800',
  },
  demoCaregiverButton: {
    backgroundColor: 'rgba(201, 84, 16, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(201, 84, 16, 0.2)',
  },
  demoCaregiverText: {
    color: '#C95410',
    fontSize: 11,
    fontWeight: '800',
  },
  backButton: {
    alignSelf: 'center',
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  backButtonText: {
    color: '#004D4D',
    fontSize: 13,
    fontWeight: '700',
  },
});
