import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { User, Heart, Phone } from 'lucide-react-native';
import { AppButton } from '../../components/ui/AppButton';
import { AppInput } from '../../components/ui/AppInput';
import { clinicalStore } from '../../src/api/client';
import { theme } from '../../src/theme';

export default function PersonalProfileScreen() {
  const insets = useSafeAreaInsets();

  // State with preserved defaults
  const [fullName, setFullName] = useState(clinicalStore.patient.name || '');
  const [age, setAge] = useState(String(clinicalStore.patient.age || 24));
  const [gender, setGender] = useState(clinicalStore.patient.gender || 'Male');
  const [preferredLang, setPreferredLang] = useState('English');
  const [condition, setCondition] = useState(clinicalStore.patient.condition || 'Type 2 Diabetes Mellitus');
  const [targetFasting, setTargetFasting] = useState('108');
  const [emergencyContact, setEmergencyContact] = useState(clinicalStore.patient.emergencyContact || '');

  // Field-specific validation errors
  const [nameError, setNameError] = useState<string | null>(null);
  const [ageError, setAgeError] = useState<string | null>(null);
  const [contactError, setContactError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const validate = () => {
    let valid = true;
    setNameError(null);
    setAgeError(null);
    setContactError(null);

    if (!fullName.trim()) {
      setNameError('Please enter your full legal name');
      valid = false;
    }

    const ageNum = parseInt(age, 10);
    if (!age.trim() || isNaN(ageNum) || ageNum < 1 || ageNum > 120) {
      setAgeError('Please enter a valid age (1–120)');
      valid = false;
    }

    if (!emergencyContact.trim()) {
      setContactError('Please provide an emergency contact name and phone number');
      valid = false;
    }

    return valid;
  };

  const handleSaveProfile = async () => {
    if (!validate()) return;
    setLoading(true);

    try {
      clinicalStore.patient.name = fullName.trim();
      clinicalStore.patient.age = parseInt(age, 10);
      clinicalStore.patient.gender = gender;
      clinicalStore.patient.condition = condition;
      clinicalStore.patient.emergencyContact = emergencyContact.trim();
      clinicalStore.notify();

      await new Promise((res) => setTimeout(res, 600));
      router.push('/(auth)/permissions');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom > 0 ? insets.bottom + 90 : 100 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.superTitle}>STEP 2 OF 3</Text>
          <Text style={styles.title}>Complete your profile</Text>
          <Text style={styles.subtitle}>
            This information sets your baseline sugar targets and personalizes your daily care plan.
          </Text>

          {/* Group 1: Personal Details */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <User color={theme.colors.primary} size={18} />
              <Text style={styles.cardSectionTitle}>Personal Information</Text>
            </View>

            <AppInput
              label="Full Legal Name *"
              value={fullName}
              onChangeText={(t) => {
                setFullName(t);
                if (nameError) setNameError(null);
              }}
              placeholder="e.g. Pranav Mirage"
              error={nameError || undefined}
            />

            <View style={styles.twoColRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <AppInput
                  label="Age *"
                  value={age}
                  onChangeText={(t) => {
                    setAge(t);
                    if (ageError) setAgeError(null);
                  }}
                  keyboardType="numeric"
                  placeholder="e.g. 24"
                  error={ageError || undefined}
                />
              </View>

              <View style={{ flex: 1.2 }}>
                <Text style={styles.fieldLabel}>Gender *</Text>
                <View style={styles.genderRow}>
                  {(['Male', 'Female', 'Other'] as const).map((g) => (
                    <TouchableOpacity
                      key={g}
                      style={[styles.genderChip, gender === g && styles.genderChipActive]}
                      onPress={() => setGender(g)}
                    >
                      <Text
                        style={[
                          styles.genderChipText,
                          gender === g && styles.genderChipTextActive,
                        ]}
                      >
                        {g}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            <AppInput
              label="Preferred Language (Optional)"
              value={preferredLang}
              onChangeText={setPreferredLang}
              placeholder="e.g. English, Marathi, Hindi"
              hint="Damu will communicate with you in your preferred language."
            />
          </View>

          {/* Group 2: Diabetes & Health Targets */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Heart color={theme.colors.primary} size={18} />
              <Text style={styles.cardSectionTitle}>Health & Sugar Goals</Text>
            </View>

            <AppInput
              label="Primary Health Condition *"
              value={condition}
              onChangeText={setCondition}
              placeholder="e.g. Type 2 Diabetes Mellitus"
            />

            <AppInput
              label="Fasting Blood Sugar Target (Optional)"
              value={targetFasting}
              onChangeText={setTargetFasting}
              keyboardType="numeric"
              placeholder="e.g. 108 mg/dL"
              hint="Your personal morning fasting goal recommended by your doctor."
            />
          </View>

          {/* Group 3: Emergency Contact */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Phone color={theme.colors.primary} size={18} />
              <Text style={styles.cardSectionTitle}>Emergency Contact</Text>
            </View>

            <AppInput
              label="Emergency Contact Name & Phone *"
              value={emergencyContact}
              onChangeText={(t) => {
                setEmergencyContact(t);
                if (contactError) setContactError(null);
              }}
              placeholder="e.g. Shivraj Kadam (+91 98765 43210)"
              error={contactError || undefined}
              hint="Required for clinical safety and urgent doctor notifications."
            />
          </View>
        </ScrollView>

        <View
          style={[
            styles.footer,
            { paddingBottom: insets.bottom > 0 ? insets.bottom + 8 : theme.spacing.lg },
          ]}
        >
          <AppButton
            title="Save Profile & Continue"
            size="lg"
            loading={loading}
            onPress={handleSaveProfile}
            accessibilityLabel="Save Profile and Continue"
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    padding: theme.spacing.xl,
    gap: theme.spacing.lg,
  },
  superTitle: {
    fontSize: theme.typography.sizes.caption,
    fontFamily: theme.typography.fonts.label,
    fontWeight: theme.typography.weights.extrabold,
    color: theme.colors.primary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 26,
    fontFamily: theme.typography.fonts.serif,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
    letterSpacing: -0.4,
    marginTop: -4,
  },
  subtitle: {
    fontSize: theme.typography.sizes.body,
    fontFamily: theme.typography.fonts.sans,
    color: theme.colors.textMuted,
    lineHeight: theme.typography.lineHeights.body,
    marginTop: -8,
    marginBottom: 4,
  },
  card: {
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderRadius: theme.borders.radius.xl,
    padding: theme.spacing.lg,
    borderWidth: 1.5,
    borderColor: theme.colors.borderGhost,
    ...theme.shadows.card,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: theme.spacing.md,
  },
  cardSectionTitle: {
    fontSize: theme.typography.sizes.bodyLg,
    fontFamily: theme.typography.fonts.serif,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
  },
  twoColRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  fieldLabel: {
    fontSize: theme.typography.sizes.bodySm,
    fontFamily: theme.typography.fonts.label,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  genderRow: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surfaceContainerLow,
    borderRadius: theme.borders.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderGhost,
    padding: 3,
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'center',
  },
  genderChip: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: theme.borders.radius.md,
  },
  genderChipActive: {
    backgroundColor: theme.colors.primary,
  },
  genderChipText: {
    fontSize: 12,
    fontFamily: theme.typography.fonts.label,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textMuted,
  },
  genderChipTextActive: {
    color: theme.colors.white,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.md,
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderGhost,
    ...theme.shadows.card,
  },
});