import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
  Modal,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import {
  Search,
  Users,
  Clock,
  Activity,
  AlertTriangle,
  ChevronRight,
  X,
  FileText,
  Calendar,
  CheckCircle2,
  ArrowLeft,
} from 'lucide-react-native';
import { theme } from '../../src/theme';
import { coordinationApi, LinkedPatient } from '../../src/api/coordination';

export default function DoctorPatientsScreen() {
  const [patients, setPatients] = useState<LinkedPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState<'ALL' | 'HIGH' | 'IN_TARGET'>('ALL');
  const [selectedPatient, setSelectedPatient] = useState<LinkedPatient | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const result = await coordinationApi.getDoctorPatients();
      setPatients(result.patients || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load assigned patients.');
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

  const filteredPatients = patients.filter((patient) => {
    const matchesSearch =
      patient.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (patient.diabetesType || '').toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (riskFilter === 'ALL') return true;

    const latestObs = (patient.observations || [])[0];
    if (!latestObs) return false;

    const isHigh = latestObs.numericValue > 180 || latestObs.numericValue < 70;
    if (riskFilter === 'HIGH') return isHigh;
    if (riskFilter === 'IN_TARGET') return !isHigh;

    return true;
  });

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
          <Text style={styles.headerTitle}>Assigned Patients</Text>
          <Text style={styles.headerSubtitle}>
            {patients.length} patient{patients.length !== 1 ? 's' : ''} under clinical oversight
          </Text>
        </View>
      </View>

      {/* Search & Filter Bar */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Search size={16} color={theme.colors.textPlaceholder} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by patient name or diagnosis..."
            placeholderTextColor={theme.colors.textPlaceholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={16} color={theme.colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Chips */}
        <View style={styles.filterRow}>
          <TouchableOpacity
            onPress={() => setRiskFilter('ALL')}
            style={[styles.filterChip, riskFilter === 'ALL' && styles.filterChipActive]}
          >
            <Text style={[styles.filterChipText, riskFilter === 'ALL' && styles.filterChipTextActive]}>
              All Patients ({patients.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setRiskFilter('HIGH')}
            style={[styles.filterChip, riskFilter === 'HIGH' && styles.filterChipActive]}
          >
            <Text style={[styles.filterChipText, riskFilter === 'HIGH' && styles.filterChipTextActive]}>
              ⚠️ Review Needed
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setRiskFilter('IN_TARGET')}
            style={[styles.filterChip, riskFilter === 'IN_TARGET' && styles.filterChipActive]}
          >
            <Text style={[styles.filterChipText, riskFilter === 'IN_TARGET' && styles.filterChipTextActive]}>
              ✓ In Target Range
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Patient List */}
      <ScrollView
        contentContainerStyle={styles.listContent}
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
        ) : filteredPatients.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Users size={40} color={theme.colors.textPlaceholder} />
            <Text style={styles.emptyTitle}>No matching patients found</Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery
                ? `No patients match "${searchQuery}".`
                : 'No patients found under this filter criterion.'}
            </Text>
          </View>
        ) : (
          filteredPatients.map((patient) => {
            const latestObs = (patient.observations || [])[0];
            const isHigh = latestObs && (latestObs.numericValue > 180);
            const isLow = latestObs && (latestObs.numericValue < 70);

            return (
              <TouchableOpacity
                key={patient.patientId}
                onPress={() => setSelectedPatient(patient)}
                style={styles.patientCard}
                activeOpacity={0.7}
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

                {/* Vitals Summary Pill */}
                {latestObs ? (
                  <View style={styles.vitalsSummaryRow}>
                    <View style={styles.vitalsLeft}>
                      <Clock size={12} color={theme.colors.textMuted} />
                      <Text style={styles.vitalsTimeText}>
                        {latestObs.context}: {new Date(latestObs.observedAt).toLocaleDateString('en-IN', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.obsBadge,
                        isLow
                          ? { backgroundColor: theme.colors.errorBg, borderColor: theme.colors.errorBorder }
                          : isHigh
                          ? { backgroundColor: theme.colors.warningBg, borderColor: theme.colors.warningBorder }
                          : { backgroundColor: theme.colors.successBg, borderColor: theme.colors.successBorder },
                      ]}
                    >
                      <Text
                        style={[
                          styles.obsBadgeText,
                          isLow
                            ? { color: theme.colors.error }
                            : isHigh
                            ? { color: theme.colors.warning }
                            : { color: theme.colors.success },
                        ]}
                      >
                        {latestObs.numericValue} {latestObs.unit}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.vitalsSummaryRow}>
                    <Text style={styles.noObsText}>No observations recorded yet</Text>
                  </View>
                )}

                {/* Tap to open indicator */}
                <View style={styles.cardFooter}>
                  <Text style={styles.cardFooterText}>Tap to review clinical chart & observations →</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Patient Detail Modal */}
      {selectedPatient && (
        <Modal
          visible={!!selectedPatient}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setSelectedPatient(null)}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>{selectedPatient.name}</Text>
                <Text style={styles.modalSubtitle}>
                  {selectedPatient.diabetesType?.replace(/_/g, ' ') || 'Type 2 Diabetes Mellitus'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedPatient(null)}
                style={styles.modalCloseButton}
              >
                <X size={20} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalContent}>
              {/* Target Guidelines Card */}
              <View style={styles.guidelinesCard}>
                <View style={styles.guidelinesHeader}>
                  <CheckCircle2 size={16} color={theme.colors.primary} />
                  <Text style={styles.guidelinesTitle}>Clinical Glycemic Guidelines</Text>
                </View>
                <View style={styles.guidelinesGrid}>
                  <View style={styles.guidelineItem}>
                    <Text style={styles.guidelineLabel}>Fasting Target</Text>
                    <Text style={styles.guidelineValue}>80 – 130 mg/dL</Text>
                  </View>
                  <View style={styles.guidelineItem}>
                    <Text style={styles.guidelineLabel}>Post-Meal Target</Text>
                    <Text style={styles.guidelineValue}>&lt; 180 mg/dL</Text>
                  </View>
                  <View style={styles.guidelineItem}>
                    <Text style={styles.guidelineLabel}>Hypo Alert</Text>
                    <Text style={[styles.guidelineValue, { color: theme.colors.error }]}>&lt; 70 mg/dL</Text>
                  </View>
                  <View style={styles.guidelineItem}>
                    <Text style={styles.guidelineLabel}>HbA1c Goal</Text>
                    <Text style={styles.guidelineValue}>&lt; 7.0 %</Text>
                  </View>
                </View>
              </View>

              {/* Recent Observations List */}
              <Text style={styles.modalSectionTitle}>Recorded Observations</Text>
              {(selectedPatient.observations || []).length === 0 ? (
                <View style={styles.noDataBox}>
                  <Text style={styles.noDataText}>No recent observations logged for this patient.</Text>
                </View>
              ) : (
                selectedPatient.observations!.map((obs) => {
                  const isHigh = obs.numericValue > 180;
                  const isLow = obs.numericValue < 70;

                  return (
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
                      <View
                        style={[
                          styles.obsBadge,
                          isLow
                            ? { backgroundColor: theme.colors.errorBg, borderColor: theme.colors.errorBorder }
                            : isHigh
                            ? { backgroundColor: theme.colors.warningBg, borderColor: theme.colors.warningBorder }
                            : { backgroundColor: theme.colors.successBg, borderColor: theme.colors.successBorder },
                        ]}
                      >
                        <Text
                          style={[
                            styles.obsBadgeText,
                            isLow
                              ? { color: theme.colors.error }
                              : isHigh
                              ? { color: theme.colors.warning }
                              : { color: theme.colors.success },
                          ]}
                        >
                          {obs.numericValue} {obs.unit}
                        </Text>
                      </View>
                    </View>
                  );
                })
              )}

              {/* Action Buttons */}
              <View style={styles.modalActions}>
                <TouchableOpacity
                  onPress={() => {
                    setSelectedPatient(null);
                    router.push('/(doctor)/appointments');
                  }}
                  style={[styles.modalActionBtn, { backgroundColor: theme.colors.primary }]}
                >
                  <Calendar size={16} color={theme.colors.white} />
                  <Text style={styles.modalActionBtnText}>Manage Appointments</Text>
                </TouchableOpacity>
              </View>
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
  searchSection: {
    backgroundColor: theme.colors.white,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: theme.typography.sizes.caption,
    color: theme.colors.text,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: theme.spacing.sm,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.bg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  filterChipActive: {
    backgroundColor: theme.colors.primarySurface,
    borderColor: theme.colors.primary,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.textMuted,
  },
  filterChipTextActive: {
    color: theme.colors.primary,
    fontWeight: theme.typography.weights.bold,
  },
  listContent: {
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
    backgroundColor: theme.colors.primarySurface,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.primary,
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
  vitalsSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.xs,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  vitalsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  vitalsTimeText: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  noObsText: {
    fontSize: 11,
    color: theme.colors.textPlaceholder,
    fontStyle: 'italic',
  },
  obsBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
  },
  obsBadgeText: {
    fontSize: 11,
    fontWeight: theme.typography.weights.extrabold,
  },
  cardFooter: {
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  cardFooterText: {
    fontSize: 11,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.primary,
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
    maxWidth: 260,
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
  guidelinesCard: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    ...theme.shadows.card,
  },
  guidelinesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: theme.spacing.sm,
  },
  guidelinesTitle: {
    fontSize: 12,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
  },
  guidelinesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  guidelineItem: {
    width: '47%',
    padding: 8,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.bg,
  },
  guidelineLabel: {
    fontSize: 10,
    color: theme.colors.textMuted,
  },
  guidelineValue: {
    fontSize: 13,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
    marginTop: 2,
  },
  modalSectionTitle: {
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
  modalActions: {
    marginTop: theme.spacing.xl,
  },
  modalActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: theme.radius.sm,
  },
  modalActionBtnText: {
    fontSize: 14,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.white,
  },
});