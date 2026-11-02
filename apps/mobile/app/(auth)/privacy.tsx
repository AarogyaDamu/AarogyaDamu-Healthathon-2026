import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  ShieldCheck,
  Lock,
  FileText,
  CheckSquare,
  Square,
  ChevronRight,
  X,
} from 'lucide-react-native';
import { AppButton } from '../../components/ui/AppButton';
import { theme } from '../../src/theme';

export default function PrivacyScreen() {
  const insets = useSafeAreaInsets();
  const [agreedStorage, setAgreedStorage] = useState(false);
  const [agreedRevocation, setAgreedRevocation] = useState(false);
  const [policyModal, setPolicyModal] = useState<'TERMS' | 'PRIVACY' | null>(null);

  const canContinue = agreedStorage && agreedRevocation;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom > 0 ? insets.bottom + 90 : 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerIcon}>
          <ShieldCheck color={theme.colors.primary} size={32} />
        </View>

        <Text style={styles.title}>Your Health Privacy & Consent</Text>
        <Text style={styles.description}>
          AarogyaDamu puts you in full control of your health information. Here is our promise to you in plain language.
        </Text>

        {/* Clear Highlight Cards */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Lock color={theme.colors.primary} size={20} />
            <Text style={styles.cardHeading}>1. You Own Your Medical Data</Text>
          </View>
          <Text style={styles.cardBody}>
            Your blood sugar logs, prescriptions, and lab tests are stored securely. We never sell or share your personal health records with third-party advertisers.
          </Text>

          <View style={[styles.cardRow, { marginTop: theme.spacing.lg }]}>
            <FileText color={theme.colors.primary} size={20} />
            <Text style={styles.cardHeading}>2. Controlled Doctor Sharing</Text>
          </View>
          <Text style={styles.cardBody}>
            Clinicians cannot access your timeline unless you explicitly share an invite code or grant permission. You can revoke access anytime with one tap.
          </Text>
        </View>

        {/* Real Document Links */}
        <View style={styles.linksCard}>
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => setPolicyModal('PRIVACY')}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Read Full Privacy Policy"
          >
            <Text style={styles.linkText}>Read Full Privacy Policy</Text>
            <ChevronRight color={theme.colors.textMuted} size={18} />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => setPolicyModal('TERMS')}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Read Terms of Service"
          >
            <Text style={styles.linkText}>Read Terms of Service</Text>
            <ChevronRight color={theme.colors.textMuted} size={18} />
          </TouchableOpacity>
        </View>

        {/* Granular Transparent Consent Checks */}
        <Text style={styles.sectionHeader}>PLEASE CONFIRM TO CONTINUE</Text>

        <TouchableOpacity
          style={styles.consentCheckboxRow}
          onPress={() => setAgreedStorage(!agreedStorage)}
          activeOpacity={0.8}
          accessible={true}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: agreedStorage }}
          accessibilityLabel="I consent to securely saving my diabetes readings and lab reports in AarogyaDamu"
        >
          {agreedStorage ? (
            <CheckSquare color={theme.colors.primary} size={22} />
          ) : (
            <Square color={theme.colors.border} size={22} />
          )}
          <Text style={styles.consentText}>
            I consent to securely saving my blood sugar readings and lab reports in AarogyaDamu to manage my care.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.consentCheckboxRow}
          onPress={() => setAgreedRevocation(!agreedRevocation)}
          activeOpacity={0.8}
          accessible={true}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: agreedRevocation }}
          accessibilityLabel="I understand I have the right to withdraw sharing permissions at any time"
        >
          {agreedRevocation ? (
            <CheckSquare color={theme.colors.primary} size={22} />
          ) : (
            <Square color={theme.colors.border} size={22} />
          )}
          <Text style={styles.consentText}>
            I understand that I have the right to pause or revoke data-sharing with any doctor or hospital at any time.
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Floating Bottom Button */}
      <View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom > 0 ? insets.bottom + 8 : theme.spacing.lg },
        ]}
      >
        <AppButton
          title="Accept & Continue"
          size="lg"
          disabled={!canContinue}
          onPress={() => router.push({ pathname: '/(auth)/auth', params: { mode: 'signup' } })}
          accessibilityLabel="Accept terms and continue to account registration"
        />
      </View>

      {/* Policy Modal */}
      <Modal visible={policyModal !== null} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {policyModal === 'PRIVACY' ? 'Privacy Policy' : 'Terms of Service'}
              </Text>
              <TouchableOpacity
                onPress={() => setPolicyModal(null)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <X color={theme.colors.text} size={22} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll}>
              {policyModal === 'PRIVACY' ? (
                <>
                  <Text style={styles.policySectionHeading}>1. Purpose-Bound Collection</Text>
                  <Text style={styles.policySectionBody}>
                    AarogyaDamu processes your glucose logs, HbA1c values, and medical reports exclusively for the purpose of continuous diabetes management, care planning, and clinician consultation.
                  </Text>
                  <Text style={styles.policySectionHeading}>2. Your Rights Under DPDP</Text>
                  <Text style={styles.policySectionBody}>
                    In compliance with applicable Digital Personal Data Protection laws, you retain the right to access your health data, correct inaccurate records, withdraw consent at any time, and request account deletion.
                  </Text>
                  <Text style={styles.policySectionHeading}>3. Storage & Security</Text>
                  <Text style={styles.policySectionBody}>
                    All health records are protected with industry-standard encryption at rest and in transit.
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.policySectionHeading}>1. Health Management Disclaimer</Text>
                  <Text style={styles.policySectionBody}>
                    AarogyaDamu is a personal health management companion. It does not replace professional medical advice, clinical diagnosis, or emergency healthcare services.
                  </Text>
                  <Text style={styles.policySectionHeading}>2. Account Responsibility</Text>
                  <Text style={styles.policySectionBody}>
                    You agree to provide accurate information and safeguard your credentials. You are responsible for any sharing permissions granted to clinicians or family caregivers.
                  </Text>
                </>
              )}
            </ScrollView>

            <AppButton
              title="Close Document"
              variant="secondary"
              onPress={() => setPolicyModal(null)}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.white,
  },
  scrollContent: {
    padding: theme.spacing.xl,
  },
  headerIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: theme.colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.lg,
  },
  title: {
    fontSize: 26,
    fontWeight: theme.typography.weights.black,
    color: theme.colors.text,
    letterSpacing: -0.4,
    marginBottom: theme.spacing.sm,
  },
  description: {
    fontSize: theme.typography.sizes.body,
    color: theme.colors.textMuted,
    lineHeight: theme.typography.lineHeights.body,
    marginBottom: theme.spacing.xl,
  },
  card: {
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.lg,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  cardHeading: {
    fontSize: theme.typography.sizes.bodyLg,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
  },
  cardBody: {
    fontSize: theme.typography.sizes.bodySm,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.lineHeights.bodySm,
  },
  linksCard: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.xl,
    overflow: 'hidden',
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  linkText: {
    fontSize: theme.typography.sizes.bodySm,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.primary,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.borderLight,
  },
  sectionHeader: {
    fontSize: theme.typography.sizes.caption,
    fontWeight: theme.typography.weights.extrabold,
    color: theme.colors.textMuted,
    letterSpacing: 0.6,
    marginBottom: theme.spacing.md,
  },
  consentCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.md,
  },
  consentText: {
    flex: 1,
    fontSize: theme.typography.sizes.bodySm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.text,
    lineHeight: 20,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.md,
    backgroundColor: theme.colors.white,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    ...theme.shadows.card,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    padding: theme.spacing.xl,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.lg,
  },
  modalTitle: {
    fontSize: theme.typography.sizes.headingSm,
    fontWeight: theme.typography.weights.black,
    color: theme.colors.text,
  },
  modalScroll: {
    marginBottom: theme.spacing.lg,
  },
  policySectionHeading: {
    fontSize: theme.typography.sizes.body,
    fontWeight: theme.typography.weights.extrabold,
    color: theme.colors.text,
    marginTop: theme.spacing.md,
    marginBottom: 4,
  },
  policySectionBody: {
    fontSize: theme.typography.sizes.bodySm,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
});