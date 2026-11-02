import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  HeartHandshake,
  ShieldCheck,
  Bell,
  Lock,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Baby,
  Users,
  LogOut,
  Stethoscope,
} from 'lucide-react-native';
import {
  clinicalStore,
  clearMobileToken,
  logoutMobileSession,
  subscribeToClinicalStore,
  type Caregiver,

  type PatientProfile,
} from '../../src/api/client';
import { useToast } from '../../components/ui/ToastProvider';
import { theme } from '../../src/theme';
import CaregiverConsentManager from '../../src/features/coordination/CaregiverConsentManager';

const DEFAULT_PROFILE: PatientProfile = {
  name: 'User',
  age: 0,
  gender: 'Not provided',
  bloodGroup: 'Not provided',
  abhaId: '',
  abhaLinked: false,
  condition: 'Not provided',
  emergencyContact: 'Not provided',
  lastUpdated: 'Not synced',
  role: 'PATIENT',
};

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const [, setTick] = useState(0);

  const [selectedCaregiver, setSelectedCaregiver] =
    useState<Caregiver | null>(null);
const [medReminders, setMedReminders] = useState(true);
  const [sugarAlerts, setSugarAlerts] = useState(true);

  useEffect(() => {
    return subscribeToClinicalStore(() => {
      setTick((tick) => tick + 1);
    });
  }, []);

  const patient = clinicalStore.patient ?? DEFAULT_PROFILE;

  const patientName =
    typeof patient.name === 'string' && patient.name.trim()
      ? patient.name.trim()
      : 'User';

  const isDoctor = patient.role === 'DOCTOR';

  const caregivers = Array.isArray(clinicalStore.caregivers)
    ? clinicalStore.caregivers
    : [];

  const handleSwitchCaregiverTarget = (
    caregiver: Caregiver,
  ) => {
    const changed = clinicalStore.switchActiveCaregiver(caregiver.id);

    setSelectedCaregiver(null);

    if (changed) {
      showToast(
        'Profile selection updated in this session. Server-side access checks are still required.',
      );
    } else {
      showToast('Could not switch the selected profile.');
    }
  };

  const handleLogout = async () => {
    try {
      await logoutMobileSession();
    } catch {
      showToast('Signed out on this device, but server-side session revocation could not be confirmed.');
      try {
        await clearMobileToken();
      } catch {
        showToast('Unable to clear the saved session from this device.');
      }
    }
    router.replace('/(auth)/welcome');
  };

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={['top', 'left', 'right']}
    >
      <View style={styles.header}>
        <View style={styles.headerTextBlock}>
          <Text style={styles.headerSuper}>ACCOUNT & SETTINGS</Text>
          <Text style={styles.headerTitle}>Profile</Text>
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Log out"
          style={styles.logoutHeaderBtn}
          onPress={handleLogout}
          activeOpacity={0.8}
        >
          <LogOut color={theme.colors.error} size={17} />
          <Text style={styles.logoutHeaderBtnText}>Log Out</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Account card */}
        <View style={styles.card}>
          <View style={styles.accountRow}>
            <View
              style={[
                styles.avatarCircle,
                isDoctor && styles.doctorAvatar,
              ]}
            >
              <Text style={styles.avatarInitial}>
                {patientName.charAt(0).toUpperCase()}
              </Text>
            </View>

            <View style={styles.accountInfo}>
              <Text style={styles.accountName} numberOfLines={2}>
                {isDoctor ? `Dr. ${patientName}` : patientName}
              </Text>

              <Text style={styles.accountSub}>
                {patient.role} ACCOUNT
              </Text>
            </View>

            {patient.abhaLinked ? (
              <View style={styles.verifiedTag}>
                <CheckCircle2
                  color={theme.colors.success}
                  size={14}
                />
                <Text style={styles.verifiedTagText}>Linked</Text>
              </View>
            ) : null}
          </View>

          {!isDoctor ? (
            <>
              <View style={styles.divider} />

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Health ID</Text>
                <Text style={styles.infoValue}>
                  {patient.abhaId || 'Not linked'}
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Condition</Text>
                <Text style={styles.infoValue}>
                  {patient.condition || 'Not provided'}
                </Text>
              </View>

              <Text style={styles.helperText}>
                Your profile details should be loaded from your
                authenticated account.
              </Text>
            </>
          ) : null}

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Switch workspace"
            style={{
              marginTop: 16,
              paddingVertical: 12,
              paddingHorizontal: 16,
              borderRadius: 10,
              backgroundColor: '#F1F5F9',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
            onPress={() => router.replace('/session-router')}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#1E293B' }}>
              Switch Workspace (Role)
            </Text>
            <ChevronRight color="#64748B" size={16} />
          </TouchableOpacity>
        </View>

        {!isDoctor && <CaregiverConsentManager />}

        {/* Caregivers and dependents */}
        {!isDoctor ? (
          <View style={styles.card}>
            <View style={styles.titleRow}>
              <HeartHandshake
                color={theme.colors.primary}
                size={20}
              />
              <Text style={styles.sectionTitle}>
                My Caregivers & Dependents
              </Text>
            </View>

            <Text style={styles.sectionSub}>
              Choose a linked family profile to manage its care information.
              Access to another person's records must be checked by the server.
            </Text>

            {caregivers.length === 0 ? (
              <View style={styles.emptyBox}>
                <Users
                  color={theme.colors.textMuted}
                  size={22}
                />
                <Text style={styles.emptyTitle}>
                  No caregivers added
                </Text>
                <Text style={styles.emptyText}>
                  Linked caregiver profiles will appear here when available.
                </Text>
              </View>
            ) : (
              caregivers.map((caregiver) => {
                const isElderly =
                  caregiver.category === 'ELDERLY_CARE';
                const isInfant =
                  caregiver.category === 'NEWBORN_INFANT';

                const categoryLabel = isElderly
                  ? 'SENIOR CARE'
                  : isInfant
                    ? 'INFANT CARE'
                    : 'FAMILY SUPPORT';

                return (
                  <TouchableOpacity
                    key={caregiver.id}
                    accessibilityRole="button"
                    accessibilityLabel={`View caregiver ${caregiver.name}`}
                    style={[
                      styles.cgCard,
                      caregiver.active && styles.cgCardActive,
                    ]}
                    onPress={() => setSelectedCaregiver(caregiver)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.cgTopRow}>
                      <View style={styles.cgCategoryBadge}>
                        {isInfant ? (
                          <Baby
                            color={theme.colors.primary}
                            size={15}
                          />
                        ) : (
                          <Users
                            color={theme.colors.primary}
                            size={15}
                          />
                        )}

                        <Text style={styles.cgCategoryText}>
                          {categoryLabel}
                        </Text>
                      </View>

                      {caregiver.active ? (
                        <View style={styles.activePill}>
                          <Text style={styles.activePillText}>
                            ACTIVE
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.cgInfoRow}>
                      <View style={styles.cgInfo}>
                        <Text style={styles.cgName}>
                          {caregiver.name} ({caregiver.relation})
                        </Text>

                        <Text style={styles.cgAge}>
                          {caregiver.ageLabel}
                        </Text>
                      </View>

                      <ChevronRight
                        color={theme.colors.textPlaceholder}
                        size={18}
                      />
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.titleRow}>
              <Stethoscope
                color={theme.colors.primary}
                size={20}
              />
              <Text style={styles.sectionTitle}>
                Clinic Integration
              </Text>
            </View>

            <Text style={styles.sectionSub}>
              Provider and clinic information will appear here after
              your authenticated clinic account is connected.
            </Text>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Provider ID</Text>
              <Text style={styles.infoValue}>Not configured</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Primary Clinic</Text>
              <Text style={styles.infoValue}>Not connected</Text>
            </View>
          </View>
        )}

        {/* Local preferences */}
        <View style={styles.card}>
          <View style={styles.titleRow}>
            <Bell color={theme.colors.primary} size={20} />
            <Text style={styles.sectionTitle}>App Preferences</Text>
          </View>

          <View style={styles.switchRow}>
            <View style={styles.preferenceInfo}>
              <Text style={styles.switchLabel}>
                Medication Reminders
              </Text>
              <Text style={styles.switchSub}>
                Local screen preference; notification scheduling is separate.
              </Text>
            </View>

            <Switch
              accessibilityLabel="Medication reminders"
              value={medReminders}
              onValueChange={setMedReminders}
              trackColor={{
                false: theme.colors.border,
                true: theme.colors.primary,
              }}
            />
          </View>

          <View style={styles.switchRow}>
            <View style={styles.preferenceInfo}>
              <Text style={styles.switchLabel}>
                Sugar Check Alerts
              </Text>
              <Text style={styles.switchSub}>
                Local screen preference; real alerts require a notification service.
              </Text>
            </View>

            <Switch
              accessibilityLabel="Sugar check alerts"
              value={sugarAlerts}
              onValueChange={setSugarAlerts}
              trackColor={{
                false: theme.colors.border,
                true: theme.colors.primary,
              }}
            />
          </View>

          <View style={[styles.switchRow, styles.lastSwitchRow]}>
            <View style={styles.preferenceInfo}>
              <Text style={styles.switchLabel}>Demo Mode</Text>
              <Text style={styles.switchSub}>
                Indicates that this store is a prototype and is not connected
                to live clinical data.
              </Text>
            </View>

            <Switch
              accessibilityLabel="Demo mode"
              value={clinicalStore.isDemoMode}
              onValueChange={(enabled) => {
                clinicalStore.setDemoMode(enabled);

                showToast(
                  enabled
                    ? 'Demo mode enabled.'
                    : 'Demo mode display disabled. Live records are not connected.',
                );
              }}
              trackColor={{
                false: theme.colors.border,
                true: theme.colors.accent,
              }}
            />
          </View>
        </View>
      </ScrollView>

      {/* Caregiver details modal */}
      <Modal
        visible={selectedCaregiver !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedCaregiver(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderText}>
                <Text style={styles.modalSuper}>
                  CAREGIVER PROFILE
                </Text>

                <Text style={styles.modalTitle}>
                  {selectedCaregiver?.name ?? 'Caregiver'}
                </Text>

                <Text style={styles.modalSub}>
                  {selectedCaregiver?.relation ?? ''}
                  {' \u2022 '}
                  {selectedCaregiver?.ageLabel ?? ''}
                </Text>
              </View>

              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Close caregiver details"
                onPress={() => setSelectedCaregiver(null)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <XCircle
                  color={theme.colors.textMuted}
                  size={24}
                />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSectionLabel}>
              Instructions and permissions
            </Text>

            <View style={styles.permissionsBox}>
              <Text style={styles.permNote}>
                {selectedCaregiver?.specialInstructions ||
                  'No instructions provided.'}
              </Text>

              {(Array.isArray(selectedCaregiver?.permissions)
                ? selectedCaregiver.permissions
                : []
              ).map((permission, index) => (
                <View
                  key={`${permission}-${index}`}
                  style={styles.permListItem}
                >
                  <CheckCircle2
                    color={theme.colors.success}
                    size={15}
                  />
                  <Text style={styles.permItemText}>
                    {permission}
                  </Text>
                </View>
              ))}
            </View>

            <Text style={styles.modalDisclaimer}>
              Switching this local selection does not grant permission
              to view another person's records.
            </Text>

            <TouchableOpacity
              style={[
                styles.modalActionBtn,
                selectedCaregiver?.active
                  ? styles.btnDisabled
                  : styles.btnPrimary,
              ]}
              disabled={
                !selectedCaregiver || selectedCaregiver.active
              }
              onPress={() => {
                if (selectedCaregiver) {
                  handleSwitchCaregiverTarget(selectedCaregiver);
                }
              }}
            >
              <Text
                style={[
                  styles.modalActionBtnText,
                  selectedCaregiver?.active
                    ? styles.textMuted
                    : styles.textWhite,
                ]}
              >
                {selectedCaregiver?.active
                  ? 'Currently Selected'
                  : 'Select Profile'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.white,
  },
  header: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.colors.white,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  headerTextBlock: {
    flex: 1,
  },
  headerSuper: {
    fontSize: 10,
    fontWeight: theme.typography.weights.extrabold,
    color: theme.colors.primary,
    letterSpacing: 0.8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: theme.typography.weights.black,
    color: theme.colors.text,
    marginTop: 1,
  },
  logoutHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff1f2',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: '#fecdd3',
  },
  logoutHeaderBtnText: {
    fontSize: 12,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.error,
  },
  scrollContent: {
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
    backgroundColor: theme.colors.bg,
    flexGrow: 1,
  },
  card: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: 6,
  },
  sectionTitle: {
    flex: 1,
    fontSize: theme.typography.sizes.bodyLg,
    fontWeight: theme.typography.weights.extrabold,
    color: theme.colors.text,
  },
  sectionSub: {
    fontSize: theme.typography.sizes.caption,
    color: theme.colors.textMuted,
    marginBottom: 12,
    lineHeight: 19,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.borderLight,
    marginVertical: 12,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doctorAvatar: {
    backgroundColor: theme.colors.accent,
  },
  avatarInitial: {
    fontSize: 22,
    fontWeight: theme.typography.weights.black,
    color: theme.colors.white,
  },
  accountInfo: {
    flex: 1,
    minWidth: 0,
  },
  accountName: {
    fontSize: theme.typography.sizes.headingSm,
    fontWeight: theme.typography.weights.black,
    color: theme.colors.text,
  },
  accountSub: {
    fontSize: 10,
    fontWeight: theme.typography.weights.extrabold,
    color: theme.colors.textMuted,
    marginTop: 3,
    letterSpacing: 0.5,
  },
  verifiedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.successBg,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  verifiedTagText: {
    fontSize: 10,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.success,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 8,
  },
  infoLabel: {
    flex: 1,
    fontSize: theme.typography.sizes.bodySm,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.weights.semibold,
  },
  infoValue: {
    flex: 1,
    fontSize: theme.typography.sizes.bodySm,
    color: theme.colors.text,
    fontWeight: theme.typography.weights.bold,
    textAlign: 'right',
  },
  helperText: {
    marginTop: 6,
    fontSize: 11,
    lineHeight: 16,
    color: theme.colors.textMuted,
  },
  cgCard: {
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1.5,
    borderColor: theme.colors.borderLight,
  },
  cgCardActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySurface,
  },
  cgTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  cgCategoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cgCategoryText: {
    fontSize: 10,
    fontWeight: theme.typography.weights.extrabold,
    color: theme.colors.primary,
    letterSpacing: 0.4,
  },
  activePill: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.xs,
  },
  activePillText: {
    fontSize: 9,
    fontWeight: theme.typography.weights.black,
    color: theme.colors.white,
    letterSpacing: 0.5,
  },
  cgInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cgInfo: {
    flex: 1,
  },
  cgName: {
    fontSize: theme.typography.sizes.body,
    fontWeight: theme.typography.weights.extrabold,
    color: theme.colors.text,
  },
  cgAge: {
    fontSize: theme.typography.sizes.caption,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textSecondary,
    marginTop: 3,
  },
  consentBox: {
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  consentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  consentPurpose: {
    flex: 1,
    fontSize: theme.typography.sizes.body,
    fontWeight: theme.typography.weights.extrabold,
    color: theme.colors.text,
    lineHeight: 20,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.radius.xs,
  },
  badgeGranted: {
    backgroundColor: theme.colors.successBg,
  },
  badgeWithdrawn: {
    backgroundColor: theme.colors.errorBg,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: theme.typography.weights.extrabold,
  },
  textGranted: {
    color: theme.colors.success,
  },
  textWithdrawn: {
    color: theme.colors.error,
  },
  consentInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 10,
  },
  consentInfo: {
    flex: 1,
  },
  consentMeta: {
    fontSize: theme.typography.sizes.caption,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.weights.bold,
    lineHeight: 18,
  },
  consentValid: {
    fontSize: theme.typography.sizes.caption,
    color: theme.colors.textMuted,
    marginTop: 3,
  },
  emptyBox: {
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.md,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: theme.typography.weights.extrabold,
    color: theme.colors.text,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  lastSwitchRow: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  preferenceInfo: {
    flex: 1,
  },
  switchLabel: {
    fontSize: theme.typography.sizes.bodySm,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
  },
  switchSub: {
    fontSize: theme.typography.sizes.caption,
    color: theme.colors.textMuted,
    marginTop: 4,
    lineHeight: 17,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    padding: theme.spacing.xl,
    paddingBottom: 36,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: theme.spacing.md,
  },
  modalHeaderText: {
    flex: 1,
  },
  modalSuper: {
    fontSize: 10,
    fontWeight: theme.typography.weights.extrabold,
    color: theme.colors.primary,
    letterSpacing: 0.8,
  },
  modalTitle: {
    fontSize: theme.typography.sizes.heading,
    fontWeight: theme.typography.weights.black,
    color: theme.colors.text,
    marginTop: 3,
  },
  modalSub: {
    fontSize: theme.typography.sizes.bodySm,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.weights.bold,
    marginTop: 4,
  },
  modalSectionLabel: {
    fontSize: theme.typography.sizes.caption,
    fontWeight: theme.typography.weights.extrabold,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    letterSpacing: 0.4,
  },
  permissionsBox: {
    backgroundColor: theme.colors.bg,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  permNote: {
    fontSize: theme.typography.sizes.bodySm,
    color: theme.colors.textSecondary,
    marginBottom: 12,
    lineHeight: 20,
  },
  permListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  permItemText: {
    flex: 1,
    fontSize: theme.typography.sizes.bodySm,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
  },
  consentDetailPurpose: {
    fontSize: theme.typography.sizes.headingSm,
    fontWeight: theme.typography.weights.black,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
    lineHeight: 26,
  },
  consentDetailBox: {
    backgroundColor: theme.colors.bg,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  modalMetaLabel: {
    fontSize: 11,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textMuted,
    marginTop: 12,
    marginBottom: 3,
  },
  modalMetaValue: {
    fontSize: theme.typography.sizes.bodySm,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
    lineHeight: 20,
  },
  modalDisclaimer: {
    fontSize: 11,
    lineHeight: 17,
    color: theme.colors.textMuted,
    marginTop: 12,
  },
  modalActionBtn: {
    minHeight: 48,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.xl,
  },
  btnPrimary: {
    backgroundColor: theme.colors.primary,
  },
  btnError: {
    backgroundColor: theme.colors.errorBg,
    borderWidth: 1,
    borderColor: theme.colors.errorBorder,
  },
  btnDisabled: {
    backgroundColor: theme.colors.borderLight,
  },
  modalActionBtnText: {
    fontSize: theme.typography.sizes.body,
    fontWeight: theme.typography.weights.bold,
    textAlign: 'center',
  },
  textWhite: {
    color: theme.colors.white,
  },
  textError: {
    color: theme.colors.error,
  },
  textMuted: {
    color: theme.colors.textMuted,
  },
});
