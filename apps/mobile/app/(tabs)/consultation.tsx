import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Calendar,
  Stethoscope,
  Pill,
  CheckCircle2,
  FileText,
  Mic,
  Lock,
} from 'lucide-react-native';
import {
  clinicalStore,
  subscribeToClinicalStore,
  Appointment,
} from '../../src/api/client';
import { useToast } from '../../components/ui/ToastProvider';
import { theme } from '../../src/theme';

export default function ConsultationScreen() {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const [, setTick] = useState(0);

  useEffect(() => {
    return subscribeToClinicalStore(() => setTick((t) => t + 1));
  }, []);

  const [isClinicianView, setIsClinicianView] = useState(false);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [scribeState, setScribeState] = useState<'IDLE' | 'RECORDING' | 'TRANSCRIPT' | 'FINAL'>('IDLE');

  // Form states
  const [doctorAdvice, setDoctorAdvice] = useState('');
  const [medChanges, setMedChanges] = useState('');
  const [lifestyleGoals, setLifestyleGoals] = useState('');

  const appointment: Appointment | undefined = clinicalStore.appointments[0];

  const handleSavePostVisitNote = () => {
    if (!doctorAdvice.trim()) {
      showToast('Enter physician advice');
      return;
    }

    if (appointment) {
      clinicalStore.savePostVisitNote(appointment.id, {
        visitDate: 'Today',
        advice: doctorAdvice.trim(),
        medChanges: medChanges.trim() || 'No changes made.',
        lifestyleGoals: lifestyleGoals.trim() || 'Continue daily walks.',
        nextFollowUpWeeks: 12,
        doctorSigned: true,
      });
      setShowNoteForm(false);
      showToast('Consultation summary documented');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* Header with Clinician Access Toggle */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerSuper}>DOCTOR APPOINTMENT & SCRIBE</Text>
          <Text style={styles.headerTitle}>Consultation Prep</Text>
        </View>

        <TouchableOpacity
          style={[styles.roleBadge, isClinicianView && styles.roleBadgeActive]}
          onPress={() => {
            const next = !isClinicianView;
            setIsClinicianView(next);
            showToast(next ? 'Clinician authorization mode enabled' : 'Patient view active');
          }}
        >
          <Lock color={isClinicianView ? theme.colors.white : theme.colors.primary} size={12} />
          <Text style={[styles.roleBadgeText, isClinicianView && styles.roleBadgeTextActive]}>
            {isClinicianView ? 'Doctor Mode' : 'Patient View'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 90 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. Next Appointment First */}
        {appointment ? (
          <View style={styles.heroCard}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.heroTag}>NEXT SCHEDULED VISIT</Text>
              <View style={styles.badgeOrange}>
                <Text style={styles.badgeOrangeText}>{appointment.status}</Text>
              </View>
            </View>

            <Text style={styles.doctorName}>{appointment.doctorName}</Text>
            <Text style={styles.doctorSpecialty}>{appointment.specialty}</Text>

            <View style={styles.timeBox}>
              <Calendar color={theme.colors.primary} size={16} />
              <Text style={styles.timeText}>
                {appointment.date} at {appointment.time} ({appointment.mode})
              </Text>
            </View>
            <Text style={styles.facilityText}>{appointment.hospital}</Text>
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No scheduled visits</Text>
            <Text style={styles.emptySub}>Connect with your doctor to book your next checkup.</Text>
          </View>
        )}

        {/* 2. Pre-Consultation Checklist */}
        {appointment && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Consultation Checklist</Text>
            <Text style={styles.sectionSub}>Complete these tasks before meeting Dr. Patra</Text>

            <View style={styles.checklistWrap}>
              {appointment.prepChecklist.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.checkItem}
                  onPress={() => clinicalStore.toggleChecklist(appointment.id, item.id)}
                  accessible={true}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: item.done }}
                  accessibilityLabel={item.text}
                >
                  <View style={[styles.checkBox, item.done && styles.checkBoxDone]}>
                    {item.done && <CheckCircle2 color={theme.colors.white} size={14} />}
                  </View>
                  <Text style={[styles.checkText, item.done && styles.checkTextDone]}>{item.text}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* 3. Active Prescriptions (Compact Rows) */}
        <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <Pill color={theme.colors.primary} size={18} />
            <Text style={styles.sectionTitle}>Active Medications</Text>
          </View>
          <Text style={styles.sectionSub}>Present this list to your doctor during checkup</Text>

          <View style={styles.medRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.medName}>Metformin Hydrochloride (500mg)</Text>
              <Text style={styles.medInstructions}>Twice daily with breakfast and dinner</Text>
            </View>
            <View style={styles.verifiedBadge}>
              <Text style={styles.verifiedBadgeText}>Verified</Text>
            </View>
          </View>

          <View style={styles.medRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.medName}>Glimepiride (1mg)</Text>
              <Text style={styles.medInstructions}>Once daily before morning meal</Text>
            </View>
            <View style={styles.verifiedBadge}>
              <Text style={styles.verifiedBadgeText}>Verified</Text>
            </View>
          </View>
        </View>

        {/* 4. Live Consultation Scribe Workflow */}
        <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <Mic color={theme.colors.primary} size={18} />
            <Text style={styles.sectionTitle}>Live Consultation Scribe</Text>
          </View>
          <Text style={styles.sectionSub}>
            Record consultation audio to automatically transcribe clinical advice and medicine instructions.
          </Text>

          {scribeState === 'IDLE' && (
            <TouchableOpacity
              style={styles.recordActionBtn}
              onPress={() => {
                setScribeState('RECORDING');
                setTimeout(() => setScribeState('TRANSCRIPT'), 3000);
              }}
            >
              <Mic color={theme.colors.white} size={18} />
              <Text style={styles.recordActionText}>Start Consultation Recording</Text>
            </TouchableOpacity>
          )}

          {scribeState === 'RECORDING' && (
            <View style={styles.recordingLiveBox}>
              <View style={styles.pulseDot} />
              <Text style={styles.recordingLiveText}>Listening & Transcribing Doctor Visit...</Text>
            </View>
          )}

          {scribeState === 'TRANSCRIPT' && (
            <View style={styles.transcriptBox}>
              <Text style={styles.transcriptLabel}>DRAFT CLINICAL TRANSCRIPT</Text>
              <Text style={styles.transcriptText}>
                "Doctor: Fasting sugars look stable at 104. Continue Metformin 500mg twice daily. Keep doing 20-min daily walks. Schedule your eye exam."
              </Text>
              <TouchableOpacity
                style={styles.approveTranscriptBtn}
                onPress={() => {
                  setScribeState('FINAL');
                  showToast('Visit summary confirmed!');
                }}
              >
                <CheckCircle2 color={theme.colors.white} size={15} />
                <Text style={styles.approveTranscriptText}>Approve & Save Visit Summary</Text>
              </TouchableOpacity>
            </View>
          )}

          {scribeState === 'FINAL' && (
            <View style={styles.finalBox}>
              <Text style={styles.finalTitle}>✓ Visit Note Finalized</Text>
              <Text style={styles.finalText}>Advice and tasks added to Care Plan and Health Vault.</Text>
            </View>
          )}
        </View>

        {/* 5. Document Post-Visit Note (Doctor-Only / Authorized Mode) */}
        {isClinicianView ? (
          <View style={styles.card}>
            <View style={styles.sectionHeaderRow}>
              <FileText color={theme.colors.primary} size={18} />
              <Text style={styles.sectionTitle}>Doctor Post-Visit Documentation</Text>
            </View>
            <Text style={styles.sectionSub}>Authorized clinician fields for formal medical advice</Text>

            {!showNoteForm ? (
              <TouchableOpacity
                style={styles.openFormBtn}
                onPress={() => setShowNoteForm(true)}
              >
                <Text style={styles.openFormBtnText}>+ Open Post-Visit Note Form</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.noteForm}>
                <Text style={styles.fieldLabel}>Physician Advice:</Text>
                <TextInput
                  style={styles.textArea}
                  placeholder="Clinical assessment and recommendations..."
                  placeholderTextColor={theme.colors.textPlaceholder}
                  multiline
                  numberOfLines={3}
                  value={doctorAdvice}
                  onChangeText={setDoctorAdvice}
                />

                <Text style={styles.fieldLabel}>Medication Adjustments:</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Continue Metformin 500mg BD"
                  placeholderTextColor={theme.colors.textPlaceholder}
                  value={medChanges}
                  onChangeText={setMedChanges}
                />

                <Text style={styles.fieldLabel}>Lifestyle & Dietary Goals:</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. 20-min post-meal walks"
                  placeholderTextColor={theme.colors.textPlaceholder}
                  value={lifestyleGoals}
                  onChangeText={setLifestyleGoals}
                />

                <View style={styles.formActionRow}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => setShowNoteForm(false)}
                  >
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.saveNoteBtn}
                    onPress={handleSavePostVisitNote}
                  >
                    <Text style={styles.saveNoteBtnText}>Sign & Save Note</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        ) : null}

        {/* 6. Past Visit Summary */}
        {appointment?.postVisitNote && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Last Consultation Summary</Text>
            <Text style={styles.sectionSub}>Signed by {appointment.doctorName}</Text>
            <Text style={styles.visitAdvice}>"{appointment.postVisitNote.advice}"</Text>
            <Text style={styles.visitMeds}>Medications: {appointment.postVisitNote.medChanges}</Text>
            <Text style={styles.visitGoals}>Goals: {appointment.postVisitNote.lifestyleGoals}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.white },
  header: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  headerSuper: { fontSize: 10, fontWeight: theme.typography.weights.extrabold, color: theme.colors.primary, letterSpacing: 0.8 },
  headerTitle: { fontSize: 20, fontWeight: theme.typography.weights.black, color: theme.colors.text },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.primarySurface,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
  },
  roleBadgeActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  roleBadgeText: { fontSize: 11, fontWeight: theme.typography.weights.bold, color: theme.colors.primary },
  roleBadgeTextActive: { color: theme.colors.white },
  scrollContent: { padding: theme.spacing.lg, gap: theme.spacing.lg, backgroundColor: theme.colors.bg },
  heroCard: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.card,
  },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  heroTag: { fontSize: 11, fontWeight: theme.typography.weights.extrabold, color: theme.colors.primary, letterSpacing: 0.5 },
  badgeOrange: { backgroundColor: theme.colors.accentLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeOrangeText: { fontSize: 11, fontWeight: theme.typography.weights.bold, color: theme.colors.accent },
  doctorName: { fontSize: 20, fontWeight: theme.typography.weights.black, color: theme.colors.text, marginTop: 4 },
  doctorSpecialty: { fontSize: 13, color: theme.colors.textMuted, marginTop: 2 },
  timeBox: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  timeText: { fontSize: 13, fontWeight: theme.typography.weights.bold, color: theme.colors.textSecondary },
  facilityText: { fontSize: 12, color: theme.colors.textMuted, marginTop: 4 },
  emptyCard: { backgroundColor: theme.colors.white, borderRadius: theme.radius.lg, padding: 24, alignItems: 'center' },
  emptyTitle: { fontSize: 15, fontWeight: theme.typography.weights.extrabold, color: theme.colors.text },
  emptySub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 4 },
  card: { backgroundColor: theme.colors.white, borderRadius: theme.radius.lg, padding: theme.spacing.lg, borderWidth: 1, borderColor: theme.colors.border },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: theme.typography.weights.extrabold, color: theme.colors.text },
  sectionSub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2, marginBottom: 12 },
  checklistWrap: { gap: 10 },
  checkItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  checkBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' },
  checkBoxDone: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  checkText: { fontSize: 13, color: theme.colors.text, flex: 1 },
  checkTextDone: { textDecorationLine: 'line-through', color: theme.colors.textMuted },
  medRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  medName: { fontSize: 14, fontWeight: theme.typography.weights.bold, color: theme.colors.text },
  medInstructions: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  verifiedBadge: { backgroundColor: theme.colors.successBg, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  verifiedBadgeText: { fontSize: 10, fontWeight: theme.typography.weights.bold, color: theme.colors.success },
  recordActionBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  recordActionText: { color: theme.colors.white, fontSize: 14, fontWeight: theme.typography.weights.bold },
  recordingLiveBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff1f2',
    padding: 14,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: '#fecdd3',
  },
  pulseDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.error },
  recordingLiveText: { fontSize: 13, fontWeight: theme.typography.weights.bold, color: theme.colors.error },
  transcriptBox: { backgroundColor: theme.colors.bg, borderRadius: theme.radius.md, padding: 12, borderWidth: 1, borderColor: theme.colors.border },
  transcriptLabel: { fontSize: 10, fontWeight: theme.typography.weights.extrabold, color: theme.colors.primary, marginBottom: 4 },
  transcriptText: { fontSize: 13, color: theme.colors.text, lineHeight: 19, fontStyle: 'italic' },
  approveTranscriptBtn: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 10,
    borderRadius: theme.radius.sm,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
  },
  approveTranscriptText: { color: theme.colors.white, fontSize: 12, fontWeight: theme.typography.weights.bold },
  finalBox: { backgroundColor: theme.colors.successBg, padding: 12, borderRadius: theme.radius.md },
  finalTitle: { fontSize: 13, fontWeight: theme.typography.weights.bold, color: theme.colors.success },
  finalText: { fontSize: 12, color: theme.colors.success, marginTop: 2 },
  openFormBtn: { backgroundColor: theme.colors.primarySurface, paddingVertical: 12, borderRadius: theme.radius.md, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.primaryBorder },
  openFormBtnText: { color: theme.colors.primary, fontSize: 13, fontWeight: theme.typography.weights.bold },
  noteForm: { gap: 8 },
  fieldLabel: { fontSize: 12, fontWeight: theme.typography.weights.bold, color: theme.colors.textSecondary },
  textArea: {
    backgroundColor: theme.colors.bg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: 10,
    fontSize: 13,
    color: theme.colors.text,
    minHeight: 64,
  },
  textInput: {
    backgroundColor: theme.colors.bg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: theme.colors.text,
  },
  formActionRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 6 },
  cancelBtn: { paddingVertical: 8, paddingHorizontal: 12 },
  cancelBtnText: { fontSize: 13, fontWeight: theme.typography.weights.bold, color: theme.colors.textMuted },
  saveNoteBtn: { backgroundColor: theme.colors.primary, paddingVertical: 9, paddingHorizontal: 16, borderRadius: theme.radius.sm },
  saveNoteBtnText: { fontSize: 13, fontWeight: theme.typography.weights.bold, color: theme.colors.white },
  visitAdvice: { fontSize: 14, fontWeight: theme.typography.weights.semibold, color: theme.colors.text, lineHeight: 20 },
  visitMeds: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 6 },
  visitGoals: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
});