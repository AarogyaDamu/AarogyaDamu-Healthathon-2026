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
    backgroundColor: '#f8f9fc',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 77, 77, 0.08)',
  },
  backButton: {
    padding: 8,
    marginRight: 6,
  },
  headerTitle: {
    fontFamily: theme.fonts.serif,
    fontSize: 20,
    fontWeight: '700',
    color: '#191c20',
  },
  headerSubtitle: {
    fontFamily: theme.fonts.label,
    fontSize: 11,
    fontWeight: '600',
    color: '#535f70',
    letterSpacing: 0.3,
    marginTop: 2,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  patientCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 77, 77, 0.08)',
    padding: 16,
    gap: 12,
    ...theme.shadows.soft,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E6F8EF',
    borderWidth: 1,
    borderColor: 'rgba(0, 77, 77, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: theme.fonts.label,
    fontSize: 14,
    fontWeight: '700',
    color: '#004D4D',
  },
  patientName: {
    fontFamily: theme.fonts.sans,
    fontSize: 16,
    fontWeight: '700',
    color: '#191c20',
  },
  diabetesType: {
    fontFamily: theme.fonts.sans,
    fontSize: 12,
    color: '#535f70',
    marginTop: 2,
  },
  obsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 77, 77, 0.06)',
  },
  obsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  obsText: {
    fontFamily: theme.fonts.sans,
    fontSize: 11,
    color: '#535f70',
  },
  obsPill: {
    backgroundColor: '#E6F8EF',
    borderWidth: 1,
    borderColor: 'rgba(0, 77, 77, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  obsPillText: {
    fontFamily: theme.fonts.label,
    fontSize: 11,
    fontWeight: '700',
    color: '#004D4D',
  },
  consentStatusBox: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#fff0d8',
    borderWidth: 1,
    borderColor: 'rgba(201, 84, 16, 0.2)',
    gap: 4,
  },
  consentStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  consentStatusTitle: {
    fontFamily: theme.fonts.label,
    fontSize: 11,
    fontWeight: '700',
    color: '#004D4D',
    letterSpacing: 0.3,
  },
  consentStatusDesc: {
    fontFamily: theme.fonts.sans,
    fontSize: 11,
    color: '#004D4D',
    lineHeight: 16,
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 77, 77, 0.06)',
  },
  cardActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#E6F8EF',
    borderWidth: 1,
    borderColor: 'rgba(0, 77, 77, 0.12)',
  },
  cardActionBtnText: {
    fontFamily: theme.fonts.label,
    fontSize: 11,
    fontWeight: '700',
    color: '#004D4D',
    letterSpacing: 0.3,
  },
  cardDetailsHint: {
    fontFamily: theme.fonts.sans,
    fontSize: 11,
    color: '#535f70',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyTitle: {
    fontFamily: theme.fonts.serif,
    fontSize: 17,
    fontWeight: '700',
    color: '#191c20',
  },
  emptySubtitle: {
    fontFamily: theme.fonts.sans,
    fontSize: 12,
    color: '#535f70',
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 18,
  },
  errorBox: {
    padding: 16,
    backgroundColor: '#fff8f7',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#ffdad6',
  },
  errorText: {
    fontFamily: theme.fonts.sans,
    color: '#ba1a1a',
    fontSize: 12,
    lineHeight: 18,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#f8f9fc',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 18,
    paddingTop: 24,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 77, 77, 0.08)',
  },
  modalTitle: {
    fontFamily: theme.fonts.serif,
    fontSize: 20,
    fontWeight: '700',
    color: '#191c20',
  },
  modalSubtitle: {
    fontFamily: theme.fonts.label,
    fontSize: 11,
    color: '#535f70',
    marginTop: 2,
  },
  modalCloseButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#f2f3f9',
  },
  modalContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 14,
  },
  modalConsentCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 77, 77, 0.08)',
    padding: 16,
    gap: 8,
    ...theme.shadows.soft,
  },
  modalConsentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modalConsentTitle: {
    fontFamily: theme.fonts.label,
    fontSize: 12,
    fontWeight: '700',
    color: '#004D4D',
    letterSpacing: 0.3,
  },
  modalConsentText: {
    fontFamily: theme.fonts.sans,
    fontSize: 12,
    color: '#535f70',
    lineHeight: 18,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  permTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#e6f4ea',
    borderWidth: 1,
    borderColor: '#ceead6',
  },
  permTagText: {
    fontFamily: theme.fonts.label,
    fontSize: 10,
    fontWeight: '700',
    color: '#137333',
    letterSpacing: 0.2,
  },
  sectionTitle: {
    fontFamily: theme.fonts.serif,
    fontSize: 16,
    fontWeight: '700',
    color: '#191c20',
    marginTop: 6,
  },
  obsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0, 77, 77, 0.08)',
    ...theme.shadows.soft,
  },
  obsType: {
    fontFamily: theme.fonts.sans,
    fontSize: 13,
    fontWeight: '700',
    color: '#191c20',
  },
  obsMeta: {
    fontFamily: theme.fonts.sans,
    fontSize: 11,
    color: '#535f70',
    marginTop: 2,
  },
  noDataBox: {
    padding: 20,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0, 77, 77, 0.08)',
    alignItems: 'center',
  },
  noDataText: {
    fontFamily: theme.fonts.sans,
    fontSize: 12,
    color: '#535f70',
  },
  coordinateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#004D4D',
    marginTop: 12,
    ...theme.shadows.elevation2,
  },
  coordinateBtnText: {
    fontFamily: theme.fonts.label,
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
});