import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  StyleSheet,
  Modal,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import {
  Heart,
  Users,
  ShieldCheck,
  Calendar,
  Clock,
  ArrowLeft,
  ChevronRight,
  CheckCircle2,
  X,
  Activity,
} from 'lucide-react-native';
import { theme } from '../../src/theme';
import { coordinationApi, LinkedPatient } from '../../src/api/coordination';

export default function CaregiverDependentsScreen() {
  const [patients, setPatients] = useState<LinkedPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selectedDependent, setSelectedDependent] = useState<LinkedPatient | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const result = await coordinationApi.getCaregiverPatients();
      setPatients(result.patients || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load authorized dependents.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <View style={styles.container}>
      {/* Header Bar */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>My Dependents</Text>
          <Text style={styles.headerSubtitle}>
            {patients.length} family member{patients.length !== 1 ? 's' : ''} with active consent
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor={theme.colors.primary}
          />
        }
      >
        {loading ? (
          <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 40 }} />
        ) : error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : patients.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Heart size={44} color={theme.colors.textPlaceholder} />
            <Text style={styles.emptyTitle}>No active caregiver consents</Text>
            <Text style={styles.emptySubtitle}>
              Ask your family member to add your email address in their AarogyaDamu app under "Caregiver Connect".
            </Text>
          </View>
        ) : (
          patients.map((patient) => {
            const hasCarePlan = (patient.permissions || []).includes('VIEW_CARE_PLAN');
            const hasAppointments = (patient.permissions || []).includes('MANAGE_APPOINTMENTS') || (patient.permissions || []).includes('VIEW_TASKS');
            const latestObs = (patient.observations || [])[0];

            return (
              <TouchableOpacity
                key={patient.patientId}
                onPress={() => setSelectedDependent(patient)}
                style={styles.patientCard}
                activeOpacity={0.8}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {patient.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.patientName}>{patient.name}</Text>
                    <Text style={styles.diabetesType}>
                      {patient.diabetesType?.replace(/_/g, ' ') || 'Type 2 Diabetes Mellitus'}
                    </Text>
                  </View>
                  <ChevronRight size={18} color={theme.colors.textMuted} />
                </View>

                {/* Latest Sugar Observation */}
                {latestObs && (
                  <View style={styles.obsRow}>
                    <View style={styles.obsLeft}>
                      <Clock size={12} color={theme.colors.textMuted} />
                      <Text style={styles.obsText}>
                        Latest sugar reading ({latestObs.context}):
                      </Text>
                    </View>
                    <View style={styles.obsPill}>
                      <Text style={styles.obsPillText}>
                        {latestObs.numericValue} {latestObs.unit}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Consent & Access Pill */}
                <View style={styles.consentStatusBox}>
                  <View style={styles.consentStatusHeader}>
                    <ShieldCheck size={14} color={theme.colors.primary} />
                    <Text style={styles.consentStatusTitle}>
                      Active Patient Consent Granted
                    </Text>
                  </View>
                  <Text style={styles.consentStatusDesc}>
                    Permissions: {(patient.permissions || []).map((p) => p.replace(/_/g, ' ')).join(', ') || 'All Care Coordination'}
                  </Text>
                </View>

                {/* Action Buttons */}
                <View style={styles.cardActionsRow}>
                  <TouchableOpacity
                    onPress={() => router.push('/(caregiver)/appointments')}
                    style={styles.cardActionBtn}
                  >
                    <Calendar size={13} color={theme.colors.primary} />
                    <Text style={styles.cardActionBtnText}>Appointments</Text>
                  </TouchableOpacity>
                  <Text style={styles.cardDetailsHint}>Tap card for health details →</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Dependent Details Modal */}
      {selectedDependent && (
        <Modal
          visible={!!selectedDependent}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setSelectedDependent(null)}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>{selectedDependent.name}</Text>
                <Text style={styles.modalSubtitle}>
                  Family Health Summary • {selectedDependent.diabetesType?.replace(/_/g, ' ') || 'Type 2 Diabetes'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedDependent(null)}
                style={styles.modalCloseButton}
              >
                <X size={20} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalContent}>
              {/* Consent Guidelines */}
              <View style={styles.modalConsentCard}>
                <View style={styles.modalConsentHeader}>
                  <ShieldCheck size={16} color={theme.colors.primary} />
                  <Text style={styles.modalConsentTitle}>Authorized Caregiver Access Scope</Text>
                </View>
                <Text style={styles.modalConsentText}>
                  This record is shared under active consent granted by {selectedDependent.name}. You can review observations, support medication adherence, and coordinate clinical appointments.
                </Text>
                <View style={styles.tagsContainer}>
                  {(selectedDependent.permissions || ['VIEW_OBSERVATIONS', 'VIEW_CARE_PLAN', 'MANAGE_APPOINTMENTS']).map((perm) => (
                    <View key={perm} style={styles.permTag}>
                      <Text style={styles.permTagText}>✓ {perm.replace(/_/g, ' ')}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Recent Observations */}
              <Text style={styles.sectionTitle}>Recent Blood Glucose Observations</Text>
              {(selectedDependent.observations || []).length === 0 ? (
                <View style={styles.noDataBox}>
                  <Text style={styles.noDataText}>No recent observations logged by this dependent.</Text>
                </View>
              ) : (
                selectedDependent.observations!.map((obs) => (
                  <View key={obs.id} style={styles.obsItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.obsType}>{obs.type.replace(/_/g, ' ')}</Text>
                      <Text style={styles.obsMeta}>
                        {obs.context} • {new Date(obs.observedAt).toLocaleString('en-IN', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </Text>
                    </View>
                    <View style={styles.obsPill}>
                      <Text style={styles.obsPillText}>{obs.numericValue} {obs.unit}</Text>
                    </View>
                  </View>
                ))
              )}

              {/* Coordinate Appointment CTA */}
              <TouchableOpacity
                onPress={() => {
                  setSelectedDependent(null);
                  router.push('/(caregiver)/appointments');
                }}
                style={styles.coordinateBtn}
              >
                <Calendar size={16} color={theme.colors.white} />
                <Text style={styles.coordinateBtnText}>Coordinate Doctor Appointment</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: 50,
    paddingBottom: theme.spacing.sm,
    backgroundColor: theme.colors.white,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backButton: {
    padding: theme.spacing.sm,
    marginRight: theme.spacing.xs,
  },
  headerTitle: {
    fontSize: theme.typography.sizes.headingSm,
    fontWeight: theme.typography.weights.extrabold,
    color: theme.colors.text,
  },
  headerSubtitle: {
    fontSize: theme.typography.sizes.caption,
    color: theme.colors.textMuted,
  },
  content: {
    padding: theme.spacing.lg,
    paddingBottom: 40,
  },
  patientCard: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadows.card,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.accentLight,
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.accent,
  },
  patientName: {
    fontSize: theme.typography.sizes.body,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
  },
  diabetesType: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 1,
  },
  obsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.xs,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  obsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  obsText: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  obsPill: {
    backgroundColor: theme.colors.primarySurface,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.radius.pill,
  },
  obsPillText: {
    fontSize: 11,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.primary,
  },
  consentStatusBox: {
    marginTop: theme.spacing.sm,
    padding: 10,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.primarySurface,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
  },
  consentStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  consentStatusTitle: {
    fontSize: 11,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.primaryDark,
  },
  consentStatusDesc: {
    fontSize: 11,
    color: theme.colors.primaryDark,
    lineHeight: 15,
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.xs,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  cardActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primarySurface,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
  },
  cardActionBtnText: {
    fontSize: 11,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.primary,
  },
  cardDetailsHint: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 8,
  },
  emptyTitle: {
    fontSize: theme.typography.sizes.body,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
  },
  emptySubtitle: {
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: 'center',
    maxWidth: 280,
  },
  errorBox: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.errorBg,
    borderRadius: theme.radius.sm,
  },
  errorText: {
    color: theme.colors.error,
    fontSize: 12,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.lg,
    paddingTop: 24,
    backgroundColor: theme.colors.white,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  modalTitle: {
    fontSize: theme.typography.sizes.heading,
    fontWeight: theme.typography.weights.black,
    color: theme.colors.text,
  },
  modalSubtitle: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  modalCloseButton: {
    padding: theme.spacing.xs,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.bg,
  },
  modalContent: {
    padding: theme.spacing.lg,
    paddingBottom: 40,
  },
  modalConsentCard: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    ...theme.shadows.card,
  },
  modalConsentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  modalConsentTitle: {
    fontSize: 12,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.primary,
  },
  modalConsentText: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    lineHeight: 16,
    marginBottom: 8,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  permTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.successBg,
    borderWidth: 1,
    borderColor: theme.colors.successBorder,
  },
  permTagText: {
    fontSize: 10,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.success,
  },
  sectionTitle: {
    fontSize: theme.typography.sizes.body,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  obsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.white,
    padding: theme.spacing.md,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.xs,
  },
  obsType: {
    fontSize: 13,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
  },
  obsMeta: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  noDataBox: {
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
  },
  noDataText: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  coordinateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.accent,
    marginTop: theme.spacing.xl,
  },
  coordinateBtnText: {
    fontSize: 14,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.white,
  },
});