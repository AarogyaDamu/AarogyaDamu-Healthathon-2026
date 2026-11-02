import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Dimensions,
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Line, Text as SvgText } from 'react-native-svg';
import {
  Plus,
  Search,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  FileText,
  FileUp,
  Activity,
  AlertTriangle,
  ShieldCheck,
  X,
  Edit3,
  Check,
  XCircle,
  Eye,
} from 'lucide-react-native';
import {
  clinicalStore,
  subscribeToClinicalStore,
  MedicalReport,
  ExtractedField,
  MedicalSpecialty,
  GlucoseContext,
} from '../../src/api/client';
import { useToast } from '../../components/ui/ToastProvider';
import { theme } from '../../src/theme';

const SPECIALTIES: { key: MedicalSpecialty; label: string; sub: string }[] = [
  { key: 'DIABETOLOGY', label: 'Diabetes Care', sub: 'Blood Sugars' },
  { key: 'CARDIOLOGY', label: 'Heart & Lipids', sub: 'Cholesterol' },
  { key: 'NEPHROLOGY', label: 'Kidney Health', sub: 'Filtration' },
];

export default function HealthScreen() {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const screenWidth = Dimensions.get('window').width;
  const [, setTick] = useState(0);

  useEffect(() => {
    return subscribeToClinicalStore(() => setTick((t) => t + 1));
  }, []);

  // Primary Navigation: Verified Results & Trends VS Dedicated Medical Reports Area
  const [activeMainSection, setActiveMainSection] = useState<'VERIFIED_TRENDS' | 'REPORTS_AREA'>('VERIFIED_TRENDS');

  // --- 1. VERIFIED RESULTS & TRENDS STATE ---
  const [selectedSpecialty, setSelectedSpecialty] = useState<MedicalSpecialty>('DIABETOLOGY');
  const [searchQuery, setSearchQuery] = useState('');
  const [glucoseInput, setGlucoseInput] = useState('');
  const [mealType, setMealType] = useState<GlucoseContext>('FASTING');

  // --- 2. DEDICATED MEDICAL REPORTS AREA STATE ---
  const [reportSubTab, setReportSubTab] = useState<'ALL_REPORTS' | 'PA_QUEUE'>('ALL_REPORTS');

  // A. Upload Report Flow Modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFileType, setSelectedFileType] = useState<'PDF' | 'IMAGE'>('PDF');
  const [uploadFileName, setUploadFileName] = useState('Apollo_Lab_Oct2026.pdf');
  const [uploadPatientName, setUploadPatientName] = useState('Pranav Mirage');
  const [uploadReportDate, setUploadReportDate] = useState('27 Oct 2026');
  const [uploadFacility, setUploadFacility] = useState('Apollo Diagnostics, Pune');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // B. Extraction Review Modal
  const [activeExtractionReport, setActiveExtractionReport] = useState<MedicalReport | null>(null);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editedValue, setEditedValue] = useState('');
  const [editedUnit, setEditedUnit] = useState('');

  // C. Physician-Assistant (PA) Review Modal
  const [activePAReport, setActivePAReport] = useState<MedicalReport | null>(null);
  const [paReviewerName, setPaReviewerName] = useState('Sister Anjali (PA)');
  const [paNotes, setPaNotes] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  // Reports data from store
  const reports = clinicalStore.reports;
  const biomarkers = clinicalStore.biomarkers;
  const hba1cHistory = clinicalStore.hba1cHistory;

  const pendingPAReports = useMemo(() => {
    return reports.filter((r) => r.status === 'PENDING_PA_REVIEW');
  }, [reports]);

  const extractionReviewReports = useMemo(() => {
    return reports.filter((r) => r.status === 'EXTRACTION_REVIEW');
  }, [reports]);

  const filteredBiomarkers = useMemo(() => {
    return biomarkers.filter((b) => {
      const matchSpec = b.specialty === selectedSpecialty;
      const matchQuery =
        !searchQuery.trim() ||
        b.testName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.date.toLowerCase().includes(searchQuery.toLowerCase());
      return matchSpec && matchQuery;
    });
  }, [biomarkers, selectedSpecialty, searchQuery]);

  const handleQuickLog = () => {
    const val = parseFloat(glucoseInput);
    if (isNaN(val) || val < 40 || val > 600) {
      showToast('Enter a valid blood sugar reading (40–600 mg/dL)');
      return;
    }

    const baseline = mealType === 'FASTING' ? 108 : 145;
    const now = new Date();
    clinicalStore.addObservation({
      value: val,
      type: mealType,
      date: now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status:
        val <= (mealType === 'FASTING' ? 100 : 140)
          ? 'OPTIMAL'
          : val <= (mealType === 'FASTING' ? 125 : 180)
          ? 'NORMAL'
          : 'ELEVATED',
      source: 'MANUAL',
      patientBaseline: baseline,
    });

    setGlucoseInput('');
    showToast(`Saved ${val} mg/dL reading to your Health Vault`);
  };

  // Upload Simulation with Progress Bar
  const handleStartUpload = () => {
    setIsUploading(true);
    setUploadProgress(15);

    const step1 = setTimeout(() => setUploadProgress(45), 300);
    const step2 = setTimeout(() => setUploadProgress(85), 600);
    const step3 = setTimeout(() => {
      setUploadProgress(100);
      setIsUploading(false);
      setShowUploadModal(false);

      const created = clinicalStore.createUploadedReport({
        title: `${uploadFacility.split(' ')[0]} Lab Report (${selectedFileType})`,
        fileName: uploadFileName,
        fileType: selectedFileType,
        fileSize: selectedFileType === 'PDF' ? '1.8 MB' : '920 KB',
        patientName: uploadPatientName,
        reportDate: uploadReportDate,
        facility: uploadFacility,
      });

      showToast('Upload complete! Opening Extraction Review...');
      setActiveExtractionReport(created);
    }, 900);

    return () => {
      clearTimeout(step1);
      clearTimeout(step2);
      clearTimeout(step3);
    };
  };

  const handleSubmitToPAQueue = (rep: MedicalReport) => {
    clinicalStore.submitReportToPAQueue(rep.id, rep.extractedFields);
    setActiveExtractionReport(null);
    showToast('Extraction confirmed! Report sent to Physician Assistant review queue.');
    setActiveMainSection('REPORTS_AREA');
    setReportSubTab('PA_QUEUE');
  };

  const handleApproveByPA = (rep: MedicalReport) => {
    clinicalStore.approveReportByPA(rep.id, paReviewerName, paNotes);
    setActivePAReport(null);
    setPaNotes('');
    showToast('Report verified by PA! All measurements synced to Health Vault & Trends.');
  };

  const handleRejectByPA = (rep: MedicalReport) => {
    if (!rejectionReason.trim()) {
      showToast('Please provide a clinical reason for rejection');
      return;
    }
    clinicalStore.rejectReportByPA(rep.id, paReviewerName, rejectionReason);
    setActivePAReport(null);
    setIsRejecting(false);
    setRejectionReason('');
    showToast('Report rejected with note. Excluded from doctor health vault.');
  };

  const chartPoints = useMemo(() => clinicalStore.hba1cHistory.slice(-5), [clinicalStore.hba1cHistory.length]);

  const renderHbA1cTrendGraph = () => {
    const chartWidth = Math.max(280, screenWidth - 72);
    const chartHeight = 175;
    const padX = 28;
    const padTop = 30;
    const padBottom = 38;
    const minVal = 5.0;
    const maxVal = 8.0;

    const getX = (i: number) => padX + (i * (chartWidth - padX * 2)) / Math.max(1, chartPoints.length - 1);
    const getY = (v: number) => chartHeight - padBottom - ((v - minVal) / (maxVal - minVal)) * (chartHeight - padTop - padBottom);

    const baselineY = getY(6.2);
    const path = chartPoints.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(pt.value)}`).join(' ');

    return (
      <View style={styles.graphCard}>
        <View style={styles.graphHeaderRow}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.graphTitle}>3-Month HbA1c Trend</Text>
            <Text style={styles.graphSub}>Verified laboratory results against personal target (6.2%)</Text>
          </View>
          <View style={styles.deltaPillGreen}>
            <TrendingDown color={theme.colors.success} size={14} />
            <Text style={styles.deltaPillText}>-0.4% Below Goal</Text>
          </View>
        </View>

        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={styles.solidLine} />
            <Text style={styles.legendText}>Measured HbA1c</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={styles.dashedLine} />
            <Text style={styles.legendText}>Personal Target (6.2%)</Text>
          </View>
        </View>

        <Svg width={chartWidth} height={chartHeight}>
          <Line x1={padX} y1={baselineY} x2={chartWidth - padX} y2={baselineY} stroke={theme.colors.warning} strokeWidth="2" strokeDasharray="6,4" />
          <Path d={path} fill="none" stroke={theme.colors.primary} strokeWidth="3" />
          {chartPoints.map((pt, idx) => {
            const cx = getX(idx);
            const cy = getY(pt.value);
            const labelY = pt.value > 6.25 ? cy - 12 : cy + 20;
            return (
              <React.Fragment key={pt.id}>
                <Circle cx={cx} cy={cy} r="6" fill={theme.colors.primary} stroke={theme.colors.white} strokeWidth="2.5" />
                <SvgText x={cx} y={labelY} fill={theme.colors.text} fontSize="12" fontWeight="bold" textAnchor="middle">
                  {pt.value}%
                </SvgText>
                <SvgText x={cx} y={chartHeight - 6} fill={theme.colors.textMuted} fontSize="11" textAnchor="middle">
                  {pt.monthLabel}
                </SvgText>
              </React.Fragment>
            );
          })}
        </Svg>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* Top Bar */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerSuper}>HEALTH VAULT & MEDICAL RECORDS</Text>
          <Text style={styles.headerTitle}>Tests, Reports & Review</Text>
        </View>
        <TouchableOpacity
          style={styles.uploadQuickBtn}
          onPress={() => setShowUploadModal(true)}
          activeOpacity={0.85}
        >
          <FileUp color={theme.colors.white} size={15} />
          <Text style={styles.uploadQuickBtnText}>+ Upload</Text>
        </TouchableOpacity>
      </View>

      {/* Main Switcher: Verified Results vs Dedicated Reports Area */}
      <View style={styles.mainSwitcherWrapper}>
        <View style={styles.mainSwitcherControl}>
          <TouchableOpacity
            style={[styles.mainSwitchBtn, activeMainSection === 'VERIFIED_TRENDS' && styles.mainSwitchBtnActive]}
            onPress={() => setActiveMainSection('VERIFIED_TRENDS')}
            activeOpacity={0.85}
          >
            <Activity color={activeMainSection === 'VERIFIED_TRENDS' ? theme.colors.white : theme.colors.textMuted} size={15} />
            <Text style={[styles.mainSwitchText, activeMainSection === 'VERIFIED_TRENDS' && styles.mainSwitchTextActive]}>
              Verified Results & Trends
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.mainSwitchBtn, activeMainSection === 'REPORTS_AREA' && styles.mainSwitchBtnActive]}
            onPress={() => setActiveMainSection('REPORTS_AREA')}
            activeOpacity={0.85}
          >
            <FileText color={activeMainSection === 'REPORTS_AREA' ? theme.colors.white : theme.colors.textMuted} size={15} />
            <Text style={[styles.mainSwitchText, activeMainSection === 'REPORTS_AREA' && styles.mainSwitchTextActive]}>
              Medical Reports ({reports.length})
            </Text>
            {pendingPAReports.length > 0 && (
              <View style={styles.queueDot}>
                <Text style={styles.queueDotText}>{pendingPAReports.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 90 }]}
        showsVerticalScrollIndicator={false}
      >
        {activeMainSection === 'VERIFIED_TRENDS' ? (
          /* ========================================================================= */
          /* SCREEN 4: VERIFIED RESULTS AND TRENDS                                     */
          /* ========================================================================= */
          <>
            {/* Specialty Selector */}
            <View style={styles.specialtyRibbon}>
              {SPECIALTIES.map((spec) => {
                const active = selectedSpecialty === spec.key;
                return (
                  <TouchableOpacity
                    key={spec.key}
                    style={[styles.specialtyTab, active && styles.specialtyTabActive]}
                    onPress={() => setSelectedSpecialty(spec.key)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.specialtyTabTitle, active && styles.specialtyTabTitleActive]}>
                      {spec.label}
                    </Text>
                    <Text style={[styles.specialtyBadge, active && styles.specialtyBadgeActive]}>
                      {spec.sub}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* HbA1c Long-Term Trend SVG Graph */}
            {renderHbA1cTrendGraph()}

            {/* Quick Sugar Logger Card */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Log Instant Blood Sugar Reading</Text>
              <Text style={styles.sectionSub}>Quickly enter a test reading from your home glucometer</Text>

              <View style={styles.quickInputRow}>
                <TextInput
                  style={styles.quickInput}
                  placeholder="e.g. 105"
                  placeholderTextColor={theme.colors.textPlaceholder}
                  keyboardType="numeric"
                  value={glucoseInput}
                  onChangeText={setGlucoseInput}
                />
                <TouchableOpacity style={styles.saveBtn} onPress={handleQuickLog} activeOpacity={0.85}>
                  <Plus color={theme.colors.white} size={16} />
                  <Text style={styles.saveBtnText}>Save</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.mealPillRow}>
                {(['FASTING', 'POST_MEAL_2HR'] as const).map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.mealPill, mealType === m && styles.mealPillActive]}
                    onPress={() => setMealType(m)}
                  >
                    <Text style={[styles.mealPillText, mealType === m && styles.mealPillTextActive]}>
                      {m === 'FASTING' ? 'Morning Empty Stomach (Goal: 108)' : '2 Hours After Meal (Goal: 145)'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Structured Verified Biomarkers Table */}
            <View style={styles.card}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>
                  {selectedSpecialty === 'DIABETOLOGY'
                    ? 'Verified Diabetes Measurements'
                    : selectedSpecialty === 'CARDIOLOGY'
                    ? 'Verified Heart & Lipid Tests'
                    : 'Verified Kidney Health Tests'}
                </Text>
                <View style={styles.verifiedTagGreen}>
                  <CheckCircle2 color={theme.colors.success} size={12} />
                  <Text style={styles.verifiedTagGreenText}>PA Approved</Text>
                </View>
              </View>
              <Text style={styles.sectionSub}>All numbers are verified by a clinical assistant against original laboratory seals</Text>

              <View style={styles.searchBar}>
                <Search color={theme.colors.textPlaceholder} size={16} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search test name or date..."
                  placeholderTextColor={theme.colors.textPlaceholder}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
              </View>

              {filteredBiomarkers.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>No verified measurements match your filter.</Text>
                </View>
              ) : (
                <View style={styles.cardsContainer}>
                  {filteredBiomarkers.map((bio) => {
                    const delta = +(bio.value - bio.patientBaseline).toFixed(1);
                    const isGood = delta <= 0;
                    return (
                      <View key={bio.id} style={styles.biomarkerCard}>
                        <View style={styles.bioTopRow}>
                          <Text style={styles.bioName}>{bio.testName}</Text>
                          <Text style={styles.bioValue}>
                            {bio.value} <Text style={styles.bioUnit}>{bio.unit}</Text>
                          </Text>
                        </View>

                        <View style={styles.bioMiddleRow}>
                          <Text style={styles.bioRef}>Normal: {bio.referenceRange} {bio.unit}</Text>
                          <View style={styles.targetDiffRow}>
                            {isGood ? (
                              <TrendingDown color={theme.colors.success} size={13} />
                            ) : (
                              <TrendingUp color={theme.colors.warning} size={13} />
                            )}
                            <Text style={[styles.bioDiff, isGood ? styles.textGood : styles.textWarn]}>
                              {delta > 0 ? `+${delta}` : delta} vs goal ({bio.patientBaseline} {bio.unit})
                            </Text>
                          </View>
                        </View>

                        <View style={styles.bioBottomRow}>
                          <View style={styles.verifiedPill}>
                            <Text style={styles.verifiedPillText}>✓ Verified by {bio.paReviewer || 'Care Team'}</Text>
                          </View>
                          <Text style={styles.bioDate}>{bio.date}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </>
        ) : (
          /* ========================================================================= */
          /* DEDICATED MEDICAL REPORTS AREA                                            */
          /* ========================================================================= */
          <>
            {/* Sub-Header Tabs */}
            <View style={styles.reportSubHeader}>
              <TouchableOpacity
                style={[styles.reportSubBtn, reportSubTab === 'ALL_REPORTS' && styles.reportSubBtnActive]}
                onPress={() => setReportSubTab('ALL_REPORTS')}
              >
                <Text style={[styles.reportSubText, reportSubTab === 'ALL_REPORTS' && styles.reportSubTextActive]}>
                  All Documents ({reports.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.reportSubBtn, reportSubTab === 'PA_QUEUE' && styles.reportSubBtnActive]}
                onPress={() => setReportSubTab('PA_QUEUE')}
              >
                <Text style={[styles.reportSubText, reportSubTab === 'PA_QUEUE' && styles.reportSubTextActive]}>
                  PA Review Queue ({pendingPAReports.length})
                </Text>
                {pendingPAReports.length > 0 && (
                  <View style={styles.amberQueueDot}>
                    <Text style={styles.amberQueueDotText}>{pendingPAReports.length}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* In-Review Notice Banner */}
            {extractionReviewReports.length > 0 && (
              <View style={styles.extractionBanner}>
                <AlertTriangle color={theme.colors.accent} size={18} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.extractionBannerTitle}>
                    {extractionReviewReports.length} {extractionReviewReports.length === 1 ? 'Report' : 'Reports'} Ready for Extraction Review
                  </Text>
                  <Text style={styles.extractionBannerSub}>
                    Check OCR test names and values against the scanned document.
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.openReviewPill}
                  onPress={() => setActiveExtractionReport(extractionReviewReports[0])}
                >
                  <Text style={styles.openReviewPillText}>Review Now</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Reports List */}
            {reportSubTab === 'ALL_REPORTS' ? (
              <View style={styles.card}>
                <View style={styles.cardHeaderFlex}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionTitle}>Medical Reports Archive</Text>
                    <Text style={styles.sectionSub}>All uploaded PDFs, lab scans, and clinical summaries</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.uploadNewBtn}
                    onPress={() => setShowUploadModal(true)}
                  >
                    <FileUp color={theme.colors.white} size={14} />
                    <Text style={styles.uploadNewBtnText}>+ New</Text>
                  </TouchableOpacity>
                </View>

                {reports.map((rep) => {
                  const isApproved = rep.status === 'APPROVED';
                  const isPending = rep.status === 'PENDING_PA_REVIEW';
                  const isReview = rep.status === 'EXTRACTION_REVIEW';
                  const isRejected = rep.status === 'REJECTED';

                  return (
                    <View key={rep.id} style={styles.reportItemCard}>
                      <View style={styles.reportItemHeader}>
                        <View style={styles.fileTypeBadge}>
                          <Text style={styles.fileTypeText}>{rep.fileType} • {rep.fileSize}</Text>
                        </View>
                        <View
                          style={[
                            styles.statusBadge,
                            isApproved
                              ? styles.badgeGood
                              : isRejected
                              ? styles.badgeError
                              : styles.badgeWarn,
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusText,
                              isApproved ? styles.textGood : isRejected ? styles.textError : styles.textWarn,
                            ]}
                          >
                            {isApproved
                              ? '✓ Doctor Vault Approved'
                              : isPending
                              ? '⏳ Pending PA Quality Gate'
                              : isReview
                              ? '🔍 In Extraction Review'
                              : '✕ Rejected'}
                          </Text>
                        </View>
                      </View>

                      <Text style={styles.reportTitle}>{rep.title}</Text>
                      <Text style={styles.reportFacility}>{rep.facility} • {rep.uploadDate}</Text>
                      <Text style={styles.reportSummaryText}>{rep.conciseSummary}</Text>

                      <View style={styles.reportActionsRow}>
                        {isReview && (
                          <TouchableOpacity
                            style={styles.primaryActionBtn}
                            onPress={() => setActiveExtractionReport(rep)}
                          >
                            <Eye color={theme.colors.white} size={14} />
                            <Text style={styles.primaryActionBtnText}>Review OCR Extractions</Text>
                          </TouchableOpacity>
                        )}

                        {isPending && (
                          <TouchableOpacity
                            style={styles.paActionBtn}
                            onPress={() => setActivePAReport(rep)}
                          >
                            <CheckCircle2 color={theme.colors.white} size={14} />
                            <Text style={styles.primaryActionBtnText}>Open PA Review Queue</Text>
                          </TouchableOpacity>
                        )}

                        {isApproved && (
                          <TouchableOpacity
                            style={styles.viewResultsBtn}
                            onPress={() => setActiveMainSection('VERIFIED_TRENDS')}
                          >
                            <Text style={styles.viewResultsText}>View Verified Numbers & Chart →</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              /* PA REVIEW QUEUE VIEW */
              <View style={styles.card}>
                <View style={styles.paQueueHeader}>
                  <ShieldCheck color={theme.colors.primary} size={20} />
                  <Text style={styles.sectionTitle}>Physician-Assistant Review Queue</Text>
                </View>
                <Text style={styles.sectionSub}>
                  Clinical gatekeeper: Verify extracted numbers against original lab scans before doctors see them.
                </Text>

                {pendingPAReports.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <CheckCircle2 color={theme.colors.success} size={32} />
                    <Text style={styles.emptyTitle}>PA Review Queue Is Empty</Text>
                    <Text style={styles.emptyText}>
                      All uploaded lab reports have been checked, corrected, and verified.
                    </Text>
                  </View>
                ) : (
                  pendingPAReports.map((rep) => (
                    <TouchableOpacity
                      key={rep.id}
                      style={styles.paQueueItem}
                      onPress={() => setActivePAReport(rep)}
                      activeOpacity={0.85}
                    >
                      <View style={styles.paQueueTop}>
                        <Text style={styles.paQueueTitle}>{rep.title}</Text>
                        <View style={styles.pendingTag}>
                          <Text style={styles.pendingTagText}>Needs PA Signature</Text>
                        </View>
                      </View>
                      <Text style={styles.paQueueMeta}>{rep.facility} • Patient: {rep.patientName}</Text>
                      <Text style={styles.paQueueSnippet}>
                        {rep.extractedFields.length} biomarkers ready for clinical sign-off →
                      </Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* ========================================================================= */}
      {/* SCREEN 1: UPLOAD REPORT FLOW (MODAL)                                      */}
      {/* ========================================================================= */}
      <Modal visible={showUploadModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalSuper}>STEP 1 OF 3</Text>
                <Text style={styles.modalHeading}>Upload Medical Document</Text>
              </View>
              <TouchableOpacity onPress={() => setShowUploadModal(false)}>
                <X color={theme.colors.text} size={22} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* File Type Selector */}
              <Text style={styles.formLabel}>Select Document Format *</Text>
              <View style={styles.fileTypeRow}>
                <TouchableOpacity
                  style={[styles.fileTypeBtn, selectedFileType === 'PDF' && styles.fileTypeBtnActive]}
                  onPress={() => {
                    setSelectedFileType('PDF');
                    setUploadFileName('Apollo_Lab_Oct2026.pdf');
                  }}
                >
                  <FileText color={selectedFileType === 'PDF' ? theme.colors.white : theme.colors.primary} size={18} />
                  <Text style={[styles.fileTypeBtnText, selectedFileType === 'PDF' && styles.fileTypeBtnTextActive]}>
                    PDF Document (.pdf)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.fileTypeBtn, selectedFileType === 'IMAGE' && styles.fileTypeBtnActive]}
                  onPress={() => {
                    setSelectedFileType('IMAGE');
                    setUploadFileName('Lab_Paper_Scan.jpg');
                  }}
                >
                  <FileUp color={selectedFileType === 'IMAGE' ? theme.colors.white : theme.colors.primary} size={18} />
                  <Text style={[styles.fileTypeBtnText, selectedFileType === 'IMAGE' && styles.fileTypeBtnTextActive]}>
                    Photo Scan (.jpg)
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Selected File Card */}
              <View style={styles.selectedFileBox}>
                <FileText color={theme.colors.primary} size={24} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.selectedFileName}>{uploadFileName}</Text>
                  <Text style={styles.selectedFileSize}>
                    {selectedFileType === 'PDF' ? '1.8 MB • Digital Lab PDF' : '920 KB • High Resolution Photo'}
                  </Text>
                </View>
                <Text style={styles.readyTag}>Ready</Text>
              </View>

              {/* Upload Progress Bar */}
              {isUploading && (
                <View style={styles.progressContainer}>
                  <View style={styles.progressTopRow}>
                    <Text style={styles.progressStatusText}>Uploading & Running OCR Extraction...</Text>
                    <Text style={styles.progressPctText}>{uploadProgress}%</Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${uploadProgress}%` }]} />
                  </View>
                </View>
              )}

              {/* Confirm Patient & Report Date */}
              <Text style={styles.formSectionHeader}>CONFIRM DOCUMENT DETAILS</Text>

              <Text style={styles.formLabel}>Confirm Patient Name *</Text>
              <TextInput
                style={styles.modalInput}
                value={uploadPatientName}
                onChangeText={setUploadPatientName}
                placeholder="Full name on report"
                placeholderTextColor={theme.colors.textPlaceholder}
              />

              <Text style={styles.formLabel}>Report Collection Date *</Text>
              <TextInput
                style={styles.modalInput}
                value={uploadReportDate}
                onChangeText={setUploadReportDate}
                placeholder="e.g. 27 Oct 2026"
                placeholderTextColor={theme.colors.textPlaceholder}
              />

              <Text style={styles.formLabel}>Diagnostic Center / Facility *</Text>
              <TextInput
                style={styles.modalInput}
                value={uploadFacility}
                onChangeText={setUploadFacility}
                placeholder="e.g. Apollo Diagnostics, Pune"
                placeholderTextColor={theme.colors.textPlaceholder}
              />

              <TouchableOpacity
                style={[styles.uploadSubmitBtn, isUploading && styles.uploadSubmitBtnDisabled]}
                onPress={handleStartUpload}
                disabled={isUploading}
              >
                <Text style={styles.uploadSubmitBtnText}>
                  {isUploading ? `Uploading... ${uploadProgress}%` : 'Upload & Start OCR Extraction →'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* SCREEN 2: EXTRACTION REVIEW SCREEN (MODAL)                                */}
      {/* ========================================================================= */}
      {activeExtractionReport && (
        <Modal visible={true} transparent animationType="slide">
          <View style={styles.modalBackdrop}>
            <View style={styles.modalSheetFull}>
              <View style={styles.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalSuper}>STEP 2 OF 3: EXTRACTION REVIEW</Text>
                  <Text style={styles.modalHeading}>{activeExtractionReport.title}</Text>
                  <Text style={styles.modalSubHeader}>
                    {activeExtractionReport.facility} • {activeExtractionReport.reportDate}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setActiveExtractionReport(null)}>
                  <X color={theme.colors.text} size={22} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Informational Guidance Banner */}
                <View style={styles.extractionGuideBox}>
                  <AlertTriangle color={theme.colors.accent} size={18} />
                  <Text style={styles.extractionGuideText}>
                    Please check the extracted test names and numbers alongside the scanned line snippet. Flagged fields have lower confidence and should be double-checked.
                  </Text>
                </View>

                {/* Extracted Fields List */}
                {activeExtractionReport.extractedFields.map((field) => {
                  const isEditingThis = editingFieldId === field.id;
                  return (
                    <View
                      key={field.id}
                      style={[
                        styles.extractedFieldCard,
                        field.isUncertain && styles.extractedFieldCardUncertain,
                      ]}
                    >
                      {/* Flagged Uncertain Banner */}
                      {field.isUncertain && (
                        <View style={styles.uncertainBanner}>
                          <AlertTriangle color={theme.colors.warning} size={14} />
                          <Text style={styles.uncertainBannerText}>
                            Low Confidence ({field.confidence}%) • {field.uncertainReason || 'Needs Verification'}
                          </Text>
                        </View>
                      )}

                      <View style={styles.fieldTopRow}>
                        <Text style={styles.fieldTestName}>{field.testName}</Text>
                        <Text style={styles.fieldConfidence}>Match: {field.confidence}%</Text>
                      </View>

                      {/* Original Scanned Snippet */}
                      <View style={styles.originalSnippetBox}>
                        <Text style={styles.snippetLabel}>ORIGINAL REPORT SNIPPET:</Text>
                        <Text style={styles.snippetText}>"{field.originalSnippet}"</Text>
                      </View>

                      {/* In-Line Field Editor */}
                      {isEditingThis ? (
                        <View style={styles.fieldEditRow}>
                          <TextInput
                            style={styles.fieldEditInput}
                            value={editedValue}
                            onChangeText={setEditedValue}
                            placeholder="Value"
                            keyboardType="numeric"
                          />
                          <TextInput
                            style={styles.fieldEditUnit}
                            value={editedUnit}
                            onChangeText={setEditedUnit}
                            placeholder="Unit"
                          />
                          <TouchableOpacity
                            style={styles.fieldSaveBtn}
                            onPress={() => {
                              field.value = editedValue;
                              field.unit = editedUnit;
                              field.isUncertain = false;
                              setEditingFieldId(null);
                              showToast('Field updated');
                            }}
                          >
                            <Check color={theme.colors.white} size={16} />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View style={styles.fieldDisplayRow}>
                          <View>
                            <Text style={styles.fieldValueText}>
                              {field.value} <Text style={styles.fieldUnitText}>{field.unit}</Text>
                            </Text>
                            <Text style={styles.fieldRefText}>Normal: {field.referenceRange} {field.unit}</Text>
                          </View>
                          <TouchableOpacity
                            style={styles.fieldEditIconBtn}
                            onPress={() => {
                              setEditingFieldId(field.id);
                              setEditedValue(field.value);
                              setEditedUnit(field.unit);
                            }}
                          >
                            <Edit3 color={theme.colors.primary} size={15} />
                            <Text style={styles.fieldEditIconText}>Edit</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })}

                <TouchableOpacity
                  style={styles.submitQueueBtn}
                  onPress={() => handleSubmitToPAQueue(activeExtractionReport)}
                >
                  <ShieldCheck color={theme.colors.white} size={18} />
                  <Text style={styles.submitQueueBtnText}>
                    Confirm Extraction & Send to PA Queue →
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* SCREEN 3: PHYSICIAN-ASSISTANT (PA) REVIEW MODAL                           */}
      {/* ========================================================================= */}
      {activePAReport && (
        <Modal visible={true} transparent animationType="slide">
          <View style={styles.modalBackdrop}>
            <View style={styles.modalSheetFull}>
              <View style={styles.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalSuper}>STEP 3 OF 3: PA CLINICAL QUALITY GATE</Text>
                  <Text style={styles.modalHeading}>{activePAReport.title}</Text>
                  <Text style={styles.modalSubHeader}>
                    Patient: {activePAReport.patientName} • {activePAReport.facility}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setActivePAReport(null)}>
                  <X color={theme.colors.text} size={22} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Reviewer Badge */}
                <View style={styles.reviewerIdCard}>
                  <ShieldCheck color={theme.colors.primary} size={20} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.reviewerName}>{paReviewerName}</Text>
                    <Text style={styles.reviewerDesc}>Authorized Physician Assistant Quality Reviewer</Text>
                  </View>
                </View>

                {/* Measurements for Verification */}
                <Text style={styles.formSectionHeader}>MEASUREMENTS TO APPROVE</Text>
                {activePAReport.extractedFields.map((field) => (
                  <View key={field.id} style={styles.paFieldVerifyBox}>
                    <View style={styles.paFieldHeader}>
                      <Text style={styles.paTestName}>{field.testName}</Text>
                      <Text style={styles.paTestVal}>{field.value} {field.unit}</Text>
                    </View>
                    <Text style={styles.paSnippet}>Document text: "{field.originalSnippet}"</Text>
                  </View>
                ))}

                {/* PA Clinical Notes */}
                <Text style={styles.formLabel}>Clinical Verification Notes:</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. Verified against laboratory seal. Accurate clinical data."
                  placeholderTextColor={theme.colors.textPlaceholder}
                  value={paNotes}
                  onChangeText={setPaNotes}
                />

                {/* Rejection Form Box (If triggered) */}
                {isRejecting && (
                  <View style={styles.rejectionBox}>
                    <Text style={styles.rejectionTitle}>Specify Reason for Rejection:</Text>
                    <TextInput
                      style={styles.rejectionInput}
                      placeholder="e.g. Blurry photo, mismatched patient identity, missing stamp"
                      placeholderTextColor={theme.colors.textPlaceholder}
                      value={rejectionReason}
                      onChangeText={setRejectionReason}
                    />
                    <TouchableOpacity
                      style={styles.confirmRejectBtn}
                      onPress={() => handleRejectByPA(activePAReport)}
                    >
                      <Text style={styles.confirmRejectBtnText}>Confirm Rejection</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Action Buttons: Approve vs Reject */}
                {!isRejecting && (
                  <View style={styles.paActionBtnRow}>
                    <TouchableOpacity
                      style={styles.rejectOutlineBtn}
                      onPress={() => setIsRejecting(true)}
                    >
                      <XCircle color={theme.colors.error} size={16} />
                      <Text style={styles.rejectOutlineText}>Reject Document</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.approveFillBtn}
                      onPress={() => handleApproveByPA(activePAReport)}
                    >
                      <CheckCircle2 color={theme.colors.white} size={16} />
                      <Text style={styles.approveFillText}>Approve & Sync Vault</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
    textAlign: 'center',
    marginTop: 8,
  },
  safeArea: { flex: 1, backgroundColor: theme.colors.white },
  header: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.white,
  },
  headerLeft: { flex: 1, marginRight: 10 },
  headerSuper: { fontSize: 10, fontWeight: theme.typography.weights.extrabold, color: theme.colors.primary, letterSpacing: 0.8 },
  headerTitle: { fontSize: 22, fontWeight: theme.typography.weights.black, color: theme.colors.text, marginTop: 1 },
  uploadQuickBtn: {
    backgroundColor: theme.colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: theme.radius.md,
  },
  uploadQuickBtnText: { color: theme.colors.white, fontSize: 12, fontWeight: theme.typography.weights.bold },
  mainSwitcherWrapper: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
    backgroundColor: theme.colors.white,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  mainSwitcherControl: {
    flexDirection: 'row',
    backgroundColor: theme.colors.cardMuted,
    borderRadius: theme.radius.md,
    padding: 4,
  },
  mainSwitchBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: theme.radius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  mainSwitchBtnActive: {
    backgroundColor: theme.colors.primary,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  mainSwitchText: { fontSize: 12, fontWeight: theme.typography.weights.bold, color: theme.colors.textMuted },
  mainSwitchTextActive: { color: theme.colors.white },
  queueDot: {
    backgroundColor: theme.colors.accent,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueDotText: { color: theme.colors.white, fontSize: 10, fontWeight: theme.typography.weights.extrabold },
  scrollContent: { padding: theme.spacing.lg, gap: theme.spacing.lg, backgroundColor: theme.colors.bg },
  specialtyRibbon: { flexDirection: 'row', gap: theme.spacing.sm },
  specialtyTab: {
    flex: 1,
    backgroundColor: theme.colors.white,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
  },
  specialtyTabActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  specialtyTabTitle: { fontSize: 12, fontWeight: theme.typography.weights.bold, color: theme.colors.textSecondary },
  specialtyTabTitleActive: { color: theme.colors.white },
  specialtyBadge: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2, fontWeight: theme.typography.weights.semibold },
  specialtyBadgeActive: { color: theme.colors.primaryBorder },
  graphCard: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  graphHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  graphTitle: { fontSize: 16, fontWeight: theme.typography.weights.extrabold, color: theme.colors.text },
  graphSub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  deltaPillGreen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.successBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.radius.sm,
  },
  deltaPillText: { fontSize: 11, fontWeight: theme.typography.weights.bold, color: theme.colors.success },
  legendRow: { flexDirection: 'row', gap: 16, marginBottom: 8, marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  solidLine: { width: 16, height: 3, backgroundColor: theme.colors.primary, borderRadius: 2 },
  dashedLine: { width: 16, height: 2, backgroundColor: theme.colors.warning, borderRadius: 1 },
  legendText: { fontSize: 11, color: theme.colors.textSecondary, fontWeight: theme.typography.weights.semibold },
  card: { backgroundColor: theme.colors.white, borderRadius: theme.radius.lg, padding: theme.spacing.lg, borderWidth: 1, borderColor: theme.colors.border },
  sectionTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: theme.typography.weights.extrabold, color: theme.colors.text },
  sectionSub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2, marginBottom: 12 },
  verifiedTagGreen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.successBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  verifiedTagGreenText: { fontSize: 10, fontWeight: theme.typography.weights.extrabold, color: theme.colors.success },
  quickInputRow: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: 4, marginBottom: 10 },
  quickInput: {
    flex: 1,
    minHeight: theme.touchTarget.minHeight,
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.lg,
    fontSize: 14,
    color: theme.colors.text,
  },
  saveBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  saveBtnText: { color: theme.colors.white, fontSize: 13, fontWeight: theme.typography.weights.bold },
  mealPillRow: { flexDirection: 'row', gap: 8 },
  mealPill: {
    flex: 1,
    minHeight: 40,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.cardMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealPillActive: { backgroundColor: theme.colors.primaryBorder },
  mealPillText: { fontSize: 11, fontWeight: theme.typography.weights.bold, color: theme.colors.textMuted },
  mealPillTextActive: { color: theme.colors.primary },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 12,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 13, color: theme.colors.text },
  cardsContainer: { gap: 10 },
  biomarkerCard: {
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  bioTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 },
  bioName: { fontSize: 14, fontWeight: theme.typography.weights.extrabold, color: theme.colors.text, flex: 1, marginRight: 8 },
  bioValue: { fontSize: 18, fontWeight: theme.typography.weights.black, color: theme.colors.primary, fontVariant: ['tabular-nums'] },
  bioUnit: { fontSize: 12, fontWeight: theme.typography.weights.semibold, color: theme.colors.textMuted },
  bioMiddleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  bioRef: { fontSize: 11, color: theme.colors.textMuted },
  targetDiffRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  bioDiff: { fontSize: 11, fontWeight: theme.typography.weights.bold, fontVariant: ['tabular-nums'] },
  textGood: { color: theme.colors.success },
  textWarn: { color: theme.colors.warning },
  textError: { color: theme.colors.error },
  bioBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: theme.colors.borderLight, paddingTop: 6 },
  verifiedPill: { backgroundColor: theme.colors.successBg, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  verifiedPillText: { fontSize: 10, fontWeight: theme.typography.weights.bold, color: theme.colors.success },
  bioDate: { fontSize: 11, color: theme.colors.textMuted },
  emptyCard: { padding: 24, alignItems: 'center' },
  emptyText: { fontSize: 13, color: theme.colors.textMuted, textAlign: 'center' },
  // Dedicated Medical Reports Styles
  reportSubHeader: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  reportSubBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  reportSubBtnActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  reportSubText: { fontSize: 12, fontWeight: theme.typography.weights.bold, color: theme.colors.textSecondary },
  reportSubTextActive: { color: theme.colors.white },
  amberQueueDot: { backgroundColor: theme.colors.accent, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  amberQueueDotText: { color: theme.colors.white, fontSize: 10, fontWeight: theme.typography.weights.extrabold },
  extractionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.colors.accentLight,
    padding: 12,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    marginBottom: 10,
  },
  extractionBannerTitle: { fontSize: 13, fontWeight: theme.typography.weights.extrabold, color: theme.colors.accent },
  extractionBannerSub: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 1 },
  openReviewPill: { backgroundColor: theme.colors.accent, paddingHorizontal: 10, paddingVertical: 6, borderRadius: theme.radius.sm },
  openReviewPillText: { color: theme.colors.white, fontSize: 11, fontWeight: theme.typography.weights.extrabold },
  cardHeaderFlex: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  uploadNewBtn: { backgroundColor: theme.colors.primary, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: theme.radius.sm },
  uploadNewBtnText: { color: theme.colors.white, fontSize: 12, fontWeight: theme.typography.weights.bold },
  reportItemCard: {
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  reportItemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  fileTypeBadge: { backgroundColor: theme.colors.cardMuted, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  fileTypeText: { fontSize: 10, fontWeight: theme.typography.weights.bold, color: theme.colors.textSecondary },
  statusBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  badgeGood: { backgroundColor: theme.colors.successBg },
  badgeWarn: { backgroundColor: theme.colors.warningBg },
  badgeError: { backgroundColor: theme.colors.errorBg },
  statusText: { fontSize: 10, fontWeight: theme.typography.weights.bold },
  reportTitle: { fontSize: 15, fontWeight: theme.typography.weights.extrabold, color: theme.colors.text, marginTop: 2 },
  reportFacility: { fontSize: 12, color: theme.colors.textMuted, marginTop: 1 },
  reportSummaryText: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 6, lineHeight: 18 },
  reportActionsRow: { marginTop: 10, borderTopWidth: 1, borderTopColor: theme.colors.borderLight, paddingTop: 8 },
  primaryActionBtn: {
    backgroundColor: theme.colors.accent,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: theme.radius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  primaryActionBtnText: { color: theme.colors.white, fontSize: 12, fontWeight: theme.typography.weights.bold },
  paActionBtn: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: theme.radius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  viewResultsBtn: { paddingVertical: 4 },
  viewResultsText: { fontSize: 12, fontWeight: theme.typography.weights.bold, color: theme.colors.primary },
  // PA Queue Styles
  paQueueHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  paQueueItem: {
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: theme.colors.warningBorder,
  },
  paQueueTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  paQueueTitle: { fontSize: 14, fontWeight: theme.typography.weights.extrabold, color: theme.colors.text, flex: 1, marginRight: 8 },
  pendingTag: { backgroundColor: theme.colors.warningBg, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  pendingTagText: { fontSize: 10, fontWeight: theme.typography.weights.bold, color: theme.colors.warning },
  paQueueMeta: { fontSize: 11, color: theme.colors.textMuted, marginTop: 3 },
  paQueueSnippet: { fontSize: 12, color: theme.colors.primary, fontWeight: theme.typography.weights.bold, marginTop: 6 },
  // Modal Common Styles
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.55)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: theme.colors.white, borderTopLeftRadius: theme.radius.xl, borderTopRightRadius: theme.radius.xl, padding: theme.spacing.xl, maxHeight: '88%' },
  modalSheetFull: { backgroundColor: theme.colors.white, borderTopLeftRadius: theme.radius.xl, borderTopRightRadius: theme.radius.xl, padding: theme.spacing.xl, maxHeight: '92%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  modalSuper: { fontSize: 10, fontWeight: theme.typography.weights.extrabold, color: theme.colors.primary, letterSpacing: 0.8 },
  modalHeading: { fontSize: 18, fontWeight: theme.typography.weights.black, color: theme.colors.text, marginTop: 1 },
  modalSubHeader: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  formLabel: { fontSize: 12, fontWeight: theme.typography.weights.bold, color: theme.colors.textSecondary, marginBottom: 6 },
  formSectionHeader: { fontSize: 11, fontWeight: theme.typography.weights.extrabold, color: theme.colors.textMuted, letterSpacing: 0.8, marginVertical: 10 },
  fileTypeRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  fileTypeBtn: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  fileTypeBtnActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  fileTypeBtnText: { fontSize: 12, fontWeight: theme.typography.weights.bold, color: theme.colors.textSecondary },
  fileTypeBtnTextActive: { color: theme.colors.white },
  selectedFileBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.colors.primarySurface,
    padding: 12,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
    marginBottom: 12,
  },
  selectedFileName: { fontSize: 13, fontWeight: theme.typography.weights.bold, color: theme.colors.text },
  selectedFileSize: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  readyTag: { fontSize: 10, fontWeight: theme.typography.weights.extrabold, color: theme.colors.primary, backgroundColor: theme.colors.white, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  progressContainer: { marginBottom: 12, backgroundColor: theme.colors.bg, padding: 10, borderRadius: theme.radius.md },
  progressTopRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressStatusText: { fontSize: 11, fontWeight: theme.typography.weights.bold, color: theme.colors.primary },
  progressPctText: { fontSize: 11, fontWeight: theme.typography.weights.black, color: theme.colors.primary },
  progressTrack: { height: 6, backgroundColor: theme.colors.border, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: theme.colors.primary, borderRadius: 3 },
  modalInput: {
    backgroundColor: theme.colors.bg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: theme.colors.text,
    marginBottom: 10,
  },
  uploadSubmitBtn: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  uploadSubmitBtnDisabled: { opacity: 0.6 },
  uploadSubmitBtnText: { color: theme.colors.white, fontSize: 14, fontWeight: theme.typography.weights.bold },
  // Extraction Review Styles
  extractionGuideBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: theme.colors.accentLight,
    padding: 12,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    marginBottom: 12,
  },
  extractionGuideText: { flex: 1, fontSize: 12, color: theme.colors.textSecondary, lineHeight: 18 },
  extractedFieldCard: {
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 10,
  },
  extractedFieldCardUncertain: {
    borderColor: theme.colors.warningBorder,
    backgroundColor: '#fffdfa',
  },
  uncertainBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.warningBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
  },
  uncertainBannerText: { fontSize: 11, fontWeight: theme.typography.weights.bold, color: theme.colors.warning, flex: 1 },
  fieldTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fieldTestName: { fontSize: 14, fontWeight: theme.typography.weights.extrabold, color: theme.colors.text },
  fieldConfidence: { fontSize: 11, fontWeight: theme.typography.weights.bold, color: theme.colors.primary },
  originalSnippetBox: { backgroundColor: theme.colors.white, padding: 8, borderRadius: 6, marginVertical: 6, borderWidth: 1, borderColor: theme.colors.borderLight },
  snippetLabel: { fontSize: 9, fontWeight: theme.typography.weights.extrabold, color: theme.colors.textMuted, letterSpacing: 0.4 },
  snippetText: { fontSize: 12, color: theme.colors.textSecondary, fontStyle: 'italic', marginTop: 2 },
  fieldDisplayRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  fieldValueText: { fontSize: 16, fontWeight: theme.typography.weights.black, color: theme.colors.primary },
  fieldUnitText: { fontSize: 12, fontWeight: theme.typography.weights.bold, color: theme.colors.textMuted },
  fieldRefText: { fontSize: 11, color: theme.colors.textMuted },
  fieldEditIconBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.colors.primarySurface, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  fieldEditIconText: { fontSize: 12, fontWeight: theme.typography.weights.bold, color: theme.colors.primary },
  fieldEditRow: { flexDirection: 'row', gap: 8, marginTop: 6, alignItems: 'center' },
  fieldEditInput: { flex: 2, backgroundColor: theme.colors.white, borderWidth: 1, borderColor: theme.colors.primary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 14, fontWeight: theme.typography.weights.bold },
  fieldEditUnit: { flex: 1, backgroundColor: theme.colors.white, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, fontSize: 12 },
  fieldSaveBtn: { backgroundColor: theme.colors.primary, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  submitQueueBtn: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
    marginBottom: 20,
  },
  submitQueueBtnText: { color: theme.colors.white, fontSize: 13, fontWeight: theme.typography.weights.bold },
  // PA Review Styles
  reviewerIdCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.colors.primarySurface,
    padding: 12,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
    marginBottom: 10,
  },
  reviewerName: { fontSize: 13, fontWeight: theme.typography.weights.extrabold, color: theme.colors.primary },
  reviewerDesc: { fontSize: 11, color: theme.colors.textMuted, marginTop: 1 },
  paFieldVerifyBox: {
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.md,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  paFieldHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  paTestName: { fontSize: 13, fontWeight: theme.typography.weights.bold, color: theme.colors.text },
  paTestVal: { fontSize: 14, fontWeight: theme.typography.weights.black, color: theme.colors.primary },
  paSnippet: { fontSize: 11, color: theme.colors.textMuted, fontStyle: 'italic', marginTop: 3 },
  rejectionBox: { backgroundColor: '#fff1f2', padding: 12, borderRadius: theme.radius.md, borderWidth: 1, borderColor: '#fecdd3', marginVertical: 10 },
  rejectionTitle: { fontSize: 12, fontWeight: theme.typography.weights.bold, color: theme.colors.error, marginBottom: 6 },
  rejectionInput: { backgroundColor: theme.colors.white, borderWidth: 1, borderColor: '#fda4af', borderRadius: 8, padding: 8, fontSize: 12, color: theme.colors.text, marginBottom: 8 },
  confirmRejectBtn: { backgroundColor: theme.colors.error, paddingVertical: 10, borderRadius: theme.radius.sm, alignItems: 'center' },
  confirmRejectBtnText: { color: theme.colors.white, fontSize: 12, fontWeight: theme.typography.weights.bold },
  paActionBtnRow: { flexDirection: 'row', gap: 10, marginTop: 10, marginBottom: 20 },
  rejectOutlineBtn: {
    flex: 1,
    paddingVertical: 13,
    backgroundColor: '#fff1f2',
    borderWidth: 1,
    borderColor: '#fecdd3',
    borderRadius: theme.radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  rejectOutlineText: { fontSize: 13, fontWeight: theme.typography.weights.bold, color: theme.colors.error },
  approveFillBtn: {
    flex: 1.5,
    paddingVertical: 13,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  approveFillText: { fontSize: 13, fontWeight: theme.typography.weights.bold, color: theme.colors.white },
});