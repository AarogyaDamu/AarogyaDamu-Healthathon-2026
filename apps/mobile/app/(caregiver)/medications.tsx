import React, { useState, useCallback } from 'react';
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  Pill,
  Clock,
  ShieldCheck,
  AlertCircle,
  Lock,
  Calendar,
  Info,
  CheckCircle2,
} from 'lucide-react-native';
import { theme } from '../../src/theme';
import {
  caregiverApi,
  CaregiverMedication,
  CaregiverPatient,
} from '../../src/api/caregiver';

export default function CaregiverMedicationsScreen() {
  const [activePatient, setActivePatient] = useState<CaregiverPatient | null>(null);
  const [medications, setMedications] = useState<CaregiverMedication[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setError('');
    try {
      const patientRes = await caregiverApi.getPatients();
      const patientList = patientRes.patients || [];

      if (patientList.length === 0) {
        setActivePatient(null);
        setMedications([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      let patientId = await caregiverApi.getActivePatientId();
      let patient = patientList.find((p) => p.patientId === patientId);
      if (!patient) {
        patient = patientList[0];
        patientId = patient.patientId;
        await caregiverApi.setActivePatientId(patientId);
      }
      setActivePatient(patient);

      const perms = patient.permissions || [];
      const canView = perms.includes('VIEW_MEDICATIONS') || perms.includes('MANAGE_MEDICATIONS');

      if (!canView) {
        setError('Requires VIEW_MEDICATIONS permission to inspect prescribed medicines.');
        setMedications([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const res = await caregiverApi.getMedications(patientId);
      setMedications(res.medications || []);
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : 'Unable to load medications.';
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    void loadData();
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.colors.primary}
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Medications for {activePatient?.name || 'Patient'}</Text>
        <Text style={styles.headerSubtitle}>
          DOCTOR-PRESCRIBED MEDICINES • View active dosages, timings, and dietary instructions.
        </Text>

        {/* Clinical Boundary Notice */}
        <View style={styles.boundaryNotice}>
          <Info size={14} color="#0F766E" />
          <Text style={styles.boundaryNoticeText}>
            Prescriptions are strictly doctor-managed. Caregivers cannot create, alter dosages, pause, or delete clinical prescriptions.
          </Text>
        </View>
      </View>

      {/* Main Body */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading prescribed medications...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorCard}>
          <AlertCircle size={28} color="#DC2626" />
          <Text style={styles.errorTitle}>Access Restricted</Text>
          <Text style={styles.errorBody}>{error}</Text>
        </View>
      ) : medications.length === 0 ? (
        <View style={styles.emptyCard}>
          <Pill size={40} color={theme.colors.textPlaceholder} />
          <Text style={styles.emptyTitle}>No Prescriptions Found</Text>
          <Text style={styles.emptyBody}>
            There are currently no doctor-prescribed medications recorded for this patient.
          </Text>
        </View>
      ) : (
        medications.map((med) => {
          const isActive = med.status === 'ACTIVE';

          return (
            <View key={med.id} style={styles.medCard}>
              <View style={styles.cardHeader}>
                <View style={styles.medIconBox}>
                  <Pill size={18} color="#0F766E" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.medName}>{med.medicineName}</Text>
                  {med.genericName ? (
                    <Text style={styles.genericName}>{med.genericName}</Text>
                  ) : null}
                </View>
                <View style={[styles.statusBadge, isActive ? styles.statusActive : styles.statusPaused]}>
                  <Text style={[styles.statusText, isActive ? styles.statusTextActive : styles.statusTextPaused]}>
                    {med.status}
                  </Text>
                </View>
              </View>

              {/* Dosage Details Grid */}
              <View style={styles.dosageGrid}>
                <View style={styles.gridItem}>
                  <Text style={styles.gridLabel}>DOSAGE</Text>
                  <Text style={styles.gridValue}>{med.dosage}</Text>
                </View>
                <View style={styles.gridItem}>
                  <Text style={styles.gridLabel}>TIMING</Text>
                  <Text style={styles.gridValue}>{med.timing}</Text>
                </View>
                <View style={styles.gridItem}>
                  <Text style={styles.gridLabel}>FREQUENCY</Text>
                  <Text style={styles.gridValue}>{med.frequency || 'Daily'}</Text>
                </View>
              </View>

              {/* Instructions Callout */}
              {med.instructions ? (
                <View style={styles.instructionBox}>
                  <Text style={styles.instructionLabel}>DOCTOR INSTRUCTIONS</Text>
                  <Text style={styles.instructionText}>{med.instructions}</Text>
                </View>
              ) : null}

              {/* Food Instructions */}
              {med.foodInstructions ? (
                <View style={styles.foodBox}>
                  <Text style={styles.foodText}>Dietary: {med.foodInstructions}</Text>
                </View>
              ) : null}

              {/* Prescription Date */}
              <View style={styles.footerRow}>
                <Calendar size={12} color="#64748B" />
                <Text style={styles.footerText}>
                  Prescribed: {new Date(med.prescribedAt).toLocaleDateString()}
                </Text>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  header: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
    ...theme.shadows.card,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 18,
  },
  boundaryNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 4,
  },
  boundaryNoticeText: {
    fontSize: 11,
    color: '#475569',
    lineHeight: 16,
    flex: 1,
  },
  centerBox: {
    padding: 30,
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
  },
  errorCard: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#991B1B',
  },
  errorBody: {
    fontSize: 12,
    color: '#7F1D1D',
    textAlign: 'center',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  emptyBody: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },
  medCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  medIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F0FDFA',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CCFBF1',
  },
  medName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  genericName: {
    fontSize: 11,
    color: '#64748B',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusActive: {
    backgroundColor: '#ECFDF5',
  },
  statusPaused: {
    backgroundColor: '#FEF2F2',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  statusTextActive: {
    color: '#059669',
  },
  statusTextPaused: {
    color: '#DC2626',
  },
  dosageGrid: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    justifyContent: 'space-between',
  },
  gridItem: {
    alignItems: 'center',
    flex: 1,
  },
  gridLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  gridValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  },
  instructionBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 2,
  },
  instructionLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#0F766E',
    letterSpacing: 0.5,
  },
  instructionText: {
    fontSize: 12,
    color: '#0F172A',
    lineHeight: 16,
  },
  foodBox: {
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  foodText: {
    fontSize: 11,
    color: '#475569',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  footerText: {
    fontSize: 10,
    color: '#64748B',
  },
});
