import { DamuSourceReference } from '@aarogyadamu/contracts';
import { getAggregatedPatientHealthContext, PatientHealthContextData } from '../../services/damuHealthContextService';
import { searchDiabetesKnowledge, DiabetesKnowledgeItem } from '../knowledge/diabetesKnowledgeBase';
import { HealthInsightService } from '../../services/healthInsightService';
import { prisma } from '../../db/prisma';

export interface ToolExecutionOutput {
  toolName: string;
  data: unknown;
  summary: string;
  sources: DamuSourceReference[];
}

function parseReportText(extractedData: string | null): { status?: string; text: string } {
  if (!extractedData) return { text: '' };
  try {
    const parsed = JSON.parse(extractedData) as { status?: unknown; text?: unknown };
    return {
      status: typeof parsed.status === 'string' ? parsed.status : undefined,
      text: typeof parsed.text === 'string' ? parsed.text : '',
    };
  } catch {
    return { text: '' };
  }
}

function explainExtractedReportText(text: string): Array<{ name: string; value: string; interpretation: string }> {
  const explanations: Array<{ name: string; value: string; interpretation: string }> = [];
  const add = (name: string, value: string, interpretation: string) => explanations.push({ name, value, interpretation });

  const hba1c = text.match(/\b(?:HbA1c|A1c)\s*(?:[:=\-]\s*)?(\d+(?:\.\d+)?)\s*%/i);
  if (hba1c) add('HbA1c', `${hba1c[1]}%`, 'This reflects an approximately 2–3 month average glucose marker. Your clinician should interpret the target for you.');

  const fasting = text.match(/\bfast(?:ing)?\s*(?:blood\s*)?(?:glucose|sugar)\s*(?:[:=\-]\s*)?(\d+(?:\.\d+)?)\s*(?:mg\/dL)?/i);
  if (fasting) add('Fasting glucose', `${fasting[1]} mg/dL`, 'This is a single reading taken before eating; compare repeated readings with your clinician rather than relying on one value.');

  const postMeal = text.match(/\b(?:post[- ]?meal|post[- ]?prandial|PP)\s*(?:blood\s*)?(?:glucose|sugar)?\s*(?:[:=\-]\s*)?(\d+(?:\.\d+)?)\s*(?:mg\/dL)?/i);
  if (postMeal) add('Post-meal glucose', `${postMeal[1]} mg/dL`, 'This is a post-meal reading; the timing after food matters when your clinician reviews it.');

  const bloodPressure = text.match(/\b(?:blood\s*pressure|BP)\s*(?:[:=\-]\s*)?(\d{2,3})\s*[\/]\s*(\d{2,3})\s*mmHg?/i);
  if (bloodPressure) add('Blood pressure', `${bloodPressure[1]}/${bloodPressure[2]} mmHg`, 'Blood pressure interpretation depends on repeated measurements, symptoms, and your clinical history.');

  return explanations;
}

/**
 * Explains only OCR text that belongs to the authenticated patient's document.
 * It is deliberately deterministic: no diagnosis, treatment change, or inferred
 * lab value is generated when the report does not contain a recognizable value.
 */
export async function explainMedicalReport(
  patientId: string,
  reportId?: string,
): Promise<ToolExecutionOutput> {
  const report = await prisma.healthDocument.findFirst({
    where: { userId: patientId, ...(reportId ? { id: reportId } : {}) },
    orderBy: { reportDate: 'desc' },
    select: { id: true, title: true, category: true, reportDate: true, processingStatus: true, extractedData: true },
  });

  if (!report) {
    return {
      toolName: 'explain_medical_report',
      data: { reportId: reportId || null, status: 'NOT_FOUND', values: [] },
      summary: reportId
        ? 'That report is not available in this patient Health Vault.'
        : 'No medical report is available in this patient Health Vault yet.',
      sources: [],
    };
  }

  const extracted = parseReportText(report.extractedData);
  const values = extracted.status === 'COMPLETED' ? explainExtractedReportText(extracted.text) : [];
  const reportLabel = `${report.title} (${report.category}, ${report.reportDate.toISOString().slice(0, 10)})`;
  let summary = `Report: ${reportLabel}. `;

  if (report.processingStatus !== 'READY' || extracted.status !== 'COMPLETED') {
    summary += 'This report has not completed verified OCR yet, so Damu will not interpret it. Please check the Health Vault processing status.';
  } else if (values.length === 0) {
    summary += 'The report text was extracted, but no supported glucose, HbA1c, or blood-pressure value was recognized. Damu will not guess what an unrecognized result means; please review it with your clinician.';
  } else {
    summary += values.map((item) => `${item.name}: ${item.value}. ${item.interpretation}`).join(' ');
    summary += ' This is an educational explanation of the values explicitly found in the report, not a diagnosis or treatment recommendation.';
  }

  return {
    toolName: 'explain_medical_report',
    data: {
      reportId: report.id,
      title: report.title,
      category: report.category,
      reportDate: report.reportDate.toISOString(),
      processingStatus: report.processingStatus,
      extractedStatus: extracted.status || null,
      values,
    },
    summary,
    sources: [{
      type: 'PATIENT_RECORD',
      title: `Health Vault report: ${report.title}`,
      reference: `HealthDocument:${report.id}`,
      date: report.reportDate.toISOString(),
      content: `Verified report metadata only. OCR status: ${extracted.status || report.processingStatus}. Recognized values: ${values.length}.`,
      confidence: values.length > 0 ? 0.95 : 0.5,
    }],
  };
}

/**
 * 1. get_patient_health_summary
 */
export async function getPatientHealthSummary(
  patientId: string,
  cachedContext?: PatientHealthContextData
): Promise<ToolExecutionOutput> {
  const ctx = cachedContext || (await getAggregatedPatientHealthContext(patientId));
  const gm = ctx.glucoseMetrics;

  const summary = `Health summary for ${ctx.fullName}: Diagnosed with ${ctx.diabetesType}. Over the last 30 days, recorded ${gm.totalReadings30d} glucose readings with an overall average of ${gm.overallAverage ? `${gm.overallAverage} mg/dL` : 'no data recorded'}. Time-in-range (70-180 mg/dL) is ${gm.timeInRangePercent}%, with ${gm.dataSufficiency.toLowerCase()} data sufficiency and ${gm.coefficientOfVariationPercent !== null ? `${gm.coefficientOfVariationPercent}% coefficient of variation` : 'no variability estimate'}. Currently prescribed ${ctx.medications.length} active medication(s) with an adherence rate of ${ctx.medicationAdherence.adherenceRatePercent}%.`;

  const sources: DamuSourceReference[] = [
    {
      type: 'PATIENT_RECORD',
      title: 'Patient Profile & Health Summary',
      reference: `PatientProfile:${patientId}`,
      content: `Diagnosis: ${ctx.diabetesType}. Fasting Avg: ${gm.fastingAverage || 'N/A'}, Post-meal Avg: ${gm.postMealAverage || 'N/A'}.`,
    },
  ];

  return {
    toolName: 'get_patient_health_summary',
    data: {
      patientName: ctx.fullName,
      diabetesType: ctx.diabetesType,
      targetFastingMin: ctx.targetFastingMin,
      targetFastingMax: ctx.targetFastingMax,
      targetPostMealMax: ctx.targetPostMealMax,
      totalReadings30d: gm.totalReadings30d,
      overallAverage: gm.overallAverage,
      timeInRangePercent: gm.timeInRangePercent,
      fastingInTargetPercent: gm.fastingInTargetPercent,
      postMealInTargetPercent: gm.postMealInTargetPercent,
      standardDeviation: gm.standardDeviation,
      coefficientOfVariationPercent: gm.coefficientOfVariationPercent,
      dataSufficiency: gm.dataSufficiency,
      activeMedicationsCount: ctx.medications.length,
      adherenceRatePercent: ctx.medicationAdherence.adherenceRatePercent,
    },
    summary,
    sources,
  };
}

/**
 * 2. get_glucose_readings
 */
export async function getGlucoseReadings(
  patientId: string,
  cachedContext?: PatientHealthContextData
): Promise<ToolExecutionOutput> {
  const ctx = cachedContext || (await getAggregatedPatientHealthContext(patientId));
  const gm = ctx.glucoseMetrics;

  const summary = `Glucose analysis (last 30 days): Total readings: ${gm.totalReadings30d} (${gm.dataSufficiency.toLowerCase()} data sufficiency). Overall average: ${gm.overallAverage ? `${gm.overallAverage} mg/dL` : 'None'}. Fasting average: ${gm.fastingAverage ? `${gm.fastingAverage} mg/dL` : 'None'} with ${gm.fastingInTargetPercent ?? 'N/A'}% in the personalized fasting target. Post-meal average: ${gm.postMealAverage ? `${gm.postMealAverage} mg/dL` : 'None'} with ${gm.postMealInTargetPercent ?? 'N/A'}% within the personalized post-meal target. Highest: ${gm.highest ? `${gm.highest.value} mg/dL` : 'None'}. Lowest: ${gm.lowest ? `${gm.lowest.value} mg/dL` : 'None'}. Low sugar events (<70 mg/dL): ${gm.hypoCount}. High sugar events (>180 mg/dL): ${gm.hyperCount}. Time-in-range: ${gm.timeInRangePercent}%. Variability: ${gm.standardDeviation !== null ? `SD ${gm.standardDeviation} mg/dL, CV ${gm.coefficientOfVariationPercent}%` : 'not available'}.`;

  const sources: DamuSourceReference[] = [
    {
      type: 'PATIENT_RECORD',
      title: 'Blood Glucose Observations (30 Days)',
      reference: `HealthObservation:BLOOD_GLUCOSE:${patientId}`,
      content: `Readings count: ${gm.totalReadings30d}, Overall Avg: ${gm.overallAverage} mg/dL, TIR: ${gm.timeInRangePercent}%.`,
    },
  ];

  return {
    toolName: 'get_glucose_readings',
    data: gm,
    summary,
    sources,
  };
}

/**
 * 3. compare_glucose_periods
 */
export async function compareGlucosePeriods(
  patientId: string,
  cachedContext?: PatientHealthContextData
): Promise<ToolExecutionOutput> {
  const ctx = cachedContext || (await getAggregatedPatientHealthContext(patientId));
  const trend = ctx.glucoseMetrics.trend7dVsPrior7d;

  let summary = '';
  if (trend.direction === 'INSUFFICIENT_DATA') {
    summary = `There are insufficient glucose readings across both the last 7 days and the prior 7 days to calculate a trend comparison. Consistent logging helps identify patterns!`;
  } else {
    const deltaStr = trend.changeDelta && trend.changeDelta > 0 ? `+${trend.changeDelta}` : `${trend.changeDelta}`;
    const pctStr = trend.percentChange && trend.percentChange > 0 ? `+${trend.percentChange}%` : `${trend.percentChange}%`;
    summary = `7-Day Glucose Trend Comparison: Last 7 days average is ${trend.recent7dAvg} mg/dL compared to ${trend.prior7dAvg} mg/dL during the prior 7 days (${deltaStr} mg/dL, ${pctStr}). The trend is currently ${trend.direction.toLowerCase()}. Note: This reflects statistical change in logged readings and should be reviewed with your physician.`;
  }

  const sources: DamuSourceReference[] = [
    {
      type: 'PATIENT_RECORD',
      title: '7-Day vs Prior 7-Day Glucose Comparison',
      reference: `HealthObservation:Trends:${patientId}`,
      content: `Recent 7d Avg: ${trend.recent7dAvg ?? 'N/A'}, Prior 7d Avg: ${trend.prior7dAvg ?? 'N/A'}, Direction: ${trend.direction}.`,
    },
  ];

  return {
    toolName: 'compare_glucose_periods',
    data: trend,
    summary,
    sources,
  };
}

/**
 * 4. get_prescribed_medications
 */
export async function getPrescribedMedications(
  patientId: string,
  cachedContext?: PatientHealthContextData
): Promise<ToolExecutionOutput> {
  const ctx = cachedContext || (await getAggregatedPatientHealthContext(patientId));
  const meds = ctx.medications;

  let summary = '';
  if (meds.length === 0) {
    summary = 'No active doctor-prescribed medications are currently recorded in your Med Vault.';
  } else {
    const list = meds.map(m => `${m.medicineName} (${m.dosage}, ${m.timing}${m.instructions ? ` - ${m.instructions}` : ''})`).join('; ');
    summary = `You have ${meds.length} active prescribed medication(s): ${list}. Prescribed by your treating physician.`;
  }

  const sources: DamuSourceReference[] = meds.map(m => ({
    type: 'PATIENT_RECORD',
    title: `Prescription: ${m.medicineName}`,
    reference: `MedicationSchedule:${m.id}`,
    content: `Dose: ${m.dosage}, Timing: ${m.timing}, Prescriber: ${m.prescriber || 'Treating Doctor'}.`,
  }));

  return {
    toolName: 'get_prescribed_medications',
    data: meds,
    summary,
    sources,
  };
}

/**
 * 5. get_medication_adherence
 */
export async function getMedicationAdherence(
  patientId: string,
  cachedContext?: PatientHealthContextData
): Promise<ToolExecutionOutput> {
  const ctx = cachedContext || (await getAggregatedPatientHealthContext(patientId));
  const adh = ctx.medicationAdherence;

  const summary = `Medication adherence overview (last 30 days): Adherence rate is ${adh.adherenceRatePercent}%. Out of ${adh.scheduledOrReportedCount} doses logged, ${adh.takenDosesCount} were marked taken, ${adh.skippedCount} skipped, and ${adh.missedCount} missed.`;

  const sources: DamuSourceReference[] = [
    {
      type: 'PATIENT_RECORD',
      title: 'Medication Adherence History',
      reference: `MedicationAdherenceEvent:${patientId}`,
      content: `Adherence Rate: ${adh.adherenceRatePercent}%, Taken: ${adh.takenDosesCount}, Total Logged: ${adh.scheduledOrReportedCount}.`,
    },
  ];

  return {
    toolName: 'get_medication_adherence',
    data: adh,
    summary,
    sources,
  };
}

/**
 * 6. get_care_plan
 */
export async function getCarePlan(
  patientId: string,
  cachedContext?: PatientHealthContextData
): Promise<ToolExecutionOutput> {
  const ctx = cachedContext || (await getAggregatedPatientHealthContext(patientId));
  const cp = ctx.carePlan;

  let summary = '';
  const sources: DamuSourceReference[] = [];

  if (!cp) {
    summary = 'No active diabetes care plan has been established by your treating physician yet.';
  } else {
    const goalsStr = cp.goals.length > 0 ? cp.goals.map(g => `${g.title}${g.targetValue ? ` (${g.targetValue})` : ''}`).join(', ') : 'Maintain glycemic control';
    const instructionsStr = cp.doctorInstructions ? ` Doctor instructions: "${cp.doctorInstructions}"` : '';
    summary = `Care Plan "${cp.title}": Diagnosis: ${cp.diagnosis || 'Type 2 Diabetes'}. Key Goals: ${goalsStr}.${instructionsStr}`;

    sources.push({
      type: 'CARE_PLAN',
      title: `Care Plan: ${cp.title}`,
      reference: `CarePlan:${patientId}`,
      content: `Goals: ${goalsStr}. Doctor notes: ${cp.doctorInstructions || 'Follow prescribed plan.'}`,
    });
  }

  return {
    toolName: 'get_care_plan',
    data: cp,
    summary,
    sources,
  };
}

/**
 * 7. get_pending_tasks
 */
export async function getPendingTasks(
  patientId: string,
  cachedContext?: PatientHealthContextData
): Promise<ToolExecutionOutput> {
  const ctx = cachedContext || (await getAggregatedPatientHealthContext(patientId));
  const tasks = ctx.tasks;
  const reminders = ctx.reminders;

  let summary = '';
  if (tasks.length === 0 && reminders.length === 0) {
    summary = 'You have no pending care tasks or reminders scheduled at this time.';
  } else {
    const taskDetails = tasks.map(t => `${t.title} (Priority: ${t.priority}, Due: ${new Date(t.dueAt).toLocaleDateString()})`).join('; ');
    const reminderDetails = reminders.map(r => `${r.title} at ${new Date(r.remindAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`).join('; ');
    summary = `Pending Tasks (${tasks.length}): ${taskDetails || 'None'}. Active Reminders (${reminders.length}): ${reminderDetails || 'None'}.`;
  }

  const sources: DamuSourceReference[] = tasks.map(t => ({
    type: 'PATIENT_RECORD',
    title: `Doctor Task: ${t.title}`,
    reference: `CareTask:${t.id}`,
    content: `Due: ${new Date(t.dueAt).toLocaleDateString()}, Priority: ${t.priority}. Instructions: ${t.instructions || 'Follow doctor guidance.'}`,
  }));

  return {
    toolName: 'get_pending_tasks',
    data: { tasks, reminders },
    summary,
    sources,
  };
}

/**
 * 8. get_appointment_details
 */
export async function getAppointmentDetails(
  patientId: string,
  cachedContext?: PatientHealthContextData
): Promise<ToolExecutionOutput> {
  const ctx = cachedContext || (await getAggregatedPatientHealthContext(patientId));
  const apts = ctx.appointments;

  let summary = '';
  if (apts.length === 0) {
    summary = 'You have no upcoming doctor appointments currently scheduled. You can book a checkup via the Appointment Center.';
  } else {
    const list = apts.map(a => `${a.visitType} with Dr. ${a.doctorName} on ${new Date(a.scheduledAt).toLocaleDateString()} at ${new Date(a.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${a.status}${a.clinicName ? `, ${a.clinicName}` : ''})`).join('; ');
    summary = `Upcoming Appointments: ${list}.`;
  }

  const sources: DamuSourceReference[] = apts.map(a => ({
    type: 'PATIENT_RECORD',
    title: `Appointment with Dr. ${a.doctorName}`,
    reference: `Appointment:${a.id}`,
    date: a.scheduledAt,
    content: `${a.visitType} appointment on ${new Date(a.scheduledAt).toLocaleDateString()}. Status: ${a.status}.`,
  }));

  return {
    toolName: 'get_appointment_details',
    data: apts,
    summary,
    sources,
  };
}

/**
 * 9. get_approved_consultation_summaries
 * Strictly enforces: status: 'APPROVED' AND sharedWithPatient: true.
 * Drafts, transcripts, audio are NEVER returned.
 */
export async function getApprovedConsultationSummaries(
  patientId: string,
  cachedContext?: PatientHealthContextData
): Promise<ToolExecutionOutput> {
  const ctx = cachedContext || (await getAggregatedPatientHealthContext(patientId));
  const notes = ctx.approvedConsultations;

  let summary = '';
  const sources: DamuSourceReference[] = [];

  if (notes.length === 0) {
    summary = 'No doctor-approved consultation summaries have been shared with you yet. Once your doctor finalizes and approves your visit note, it will appear here.';
  } else {
    const list = notes.map(n => `Dr. ${n.clinicianName} on ${new Date(n.approvedAt).toLocaleDateString()}: "${n.summaryText}"`).join('\n\n');
    summary = `Doctor-Approved Consultation Summaries:\n${list}`;

    for (const n of notes) {
      sources.push({
        type: 'CLINICAL_SUMMARY',
        title: `Approved Visit Note (Dr. ${n.clinicianName})`,
        reference: `ConsultationNote:${n.id}`,
        date: n.approvedAt,
        content: n.summaryText,
      });
    }
  }

  return {
    toolName: 'get_approved_consultation_summaries',
    data: notes,
    summary,
    sources,
  };
}

/**
 * 10. search_approved_health_knowledge
 */
export async function searchApprovedHealthKnowledge(
  query: string
): Promise<ToolExecutionOutput> {
  const articles: DiabetesKnowledgeItem[] = searchDiabetesKnowledge(query, 2);

  let summary = '';
  const sources: DamuSourceReference[] = [];

  if (articles.length === 0) {
    summary = 'No specific educational guidance matching that topic was found in the clinical knowledge base. Please consult your healthcare provider.';
  } else {
    summary = articles.map(a => `[${a.title}]: ${a.summary}\n\nClinical Guidance: ${a.content}`).join('\n\n---\n\n');
    for (const a of articles) {
      sources.push({
        type: 'EDUCATIONAL_KNOWLEDGE',
        title: a.title,
        reference: a.citation,
        content: a.summary,
      });
    }
  }

  return {
    toolName: 'search_approved_health_knowledge',
    data: articles,
    summary,
    sources,
  };
}

/**
 * 11. get_journey_progress_summary (Phase 7)
 */
export async function getJourneyProgressSummaryTool(
  patientId: string
): Promise<ToolExecutionOutput> {
  const summary = await HealthInsightService.getJourneyProgressSummary(patientId);

  const textSummary = `Your care journey is currently at stage "${summary.overallProgress.currentStageId.replace(/_/g, ' ')}" (${summary.overallProgress.completionPercentage}% overall completion).
• Glucose Control: 30-day average is ${summary.glucoseProgress.averageGlucose30Days ? `${summary.glucoseProgress.averageGlucose30Days} mg/dL` : 'no readings logged'}, with ${summary.glucoseProgress.timeInRangePercentage}% Time-in-Range. Trend is ${summary.glucoseProgress.trendDirection.toLowerCase()}.
• Prescribed Medications: ${summary.medicationAdherence.prescribedMedicinesCount} active medications with ${summary.medicationAdherence.adherenceRatePercentage}% adherence over the past 30 days.
• Doctor Care Tasks: ${summary.carePlanProgress.completedTasksCount} of ${summary.carePlanProgress.totalTasksAssigned} tasks completed (${summary.carePlanProgress.pendingTasksCount} pending, ${summary.carePlanProgress.overdueTasksCount} overdue).
• Appointments: ${summary.consultationsAndAppointments.upcomingAppointmentsCount} upcoming appointment(s).
${summary.glucoseProgress.nonCausationDisclaimer}`;

  const sources: DamuSourceReference[] = [
    {
      type: 'CARE_PLAN',
      title: 'Care Journey Progress Summary',
      reference: `CareJourney:${patientId}`,
      content: `Stage: ${summary.overallProgress.currentStageId}, Completed Stages: ${summary.overallProgress.completedStagesCount}/9, TIR: ${summary.glucoseProgress.timeInRangePercentage}%.`,
    },
    {
      type: 'PATIENT_RECORD',
      title: '30-Day Medication & Task Adherence',
      reference: `AdherenceAndTasks:${patientId}`,
      content: `Med Adherence: ${summary.medicationAdherence.adherenceRatePercentage}%, Tasks Completed: ${summary.carePlanProgress.completedTasksCount}/${summary.carePlanProgress.totalTasksAssigned}.`,
    },
  ];

  return {
    toolName: 'get_journey_progress_summary',
    data: summary,
    summary: textSummary,
    sources,
  };
}

/**
 * 12. get_journey_insights (Phase 7)
 */
export async function getJourneyInsightsTool(
  patientId: string
): Promise<ToolExecutionOutput> {
  const insights = await HealthInsightService.calculateHealthInsights(patientId);

  const textSummary = insights.length > 0
    ? insights.map((ins) => `• [${ins.category}] ${ins.title}: ${ins.summary}`).join('\n\n')
    : 'No active health observations or clinical insights are currently flagged for your account.';

  const sources: DamuSourceReference[] = insights.map((ins) => ({
    type: 'PATIENT_RECORD',
    title: ins.title,
    reference: ins.sourceReference,
    content: ins.summary,
  }));

  return {
    toolName: 'get_journey_insights',
    data: insights,
    summary: textSummary,
    sources,
  };
}

/**
 * 13. get_doctor_discussion_points (Phase 7)
 */
export async function getDoctorDiscussionPointsTool(
  patientId: string
): Promise<ToolExecutionOutput> {
  const [summary, insights] = await Promise.all([
    HealthInsightService.getJourneyProgressSummary(patientId),
    HealthInsightService.calculateHealthInsights(patientId),
  ]);

  const points: string[] = [];

  // Glucose discussion point
  if (summary.glucoseProgress.totalReadings30Days < 3) {
    points.push('Discuss establishing a realistic blood glucose self-monitoring routine.');
  } else {
    points.push(
      `Review your 30-day Time-in-Range (${summary.glucoseProgress.timeInRangePercentage}%) and fasting average (${summary.glucoseProgress.fastingAverage ? `${summary.glucoseProgress.fastingAverage} mg/dL` : 'N/A'}).`
    );
    if (summary.glucoseProgress.hypoCount > 0) {
      points.push(`Mention you experienced ${summary.glucoseProgress.hypoCount} low glucose reading(s) (< 70 mg/dL).`);
    }
  }

  // Medication discussion point
  if (summary.medicationAdherence.adherenceRatePercentage < 80) {
    points.push('Discuss any side effects, timing difficulties, or reasons for missed doses with your prescribed medications.');
  } else if (summary.medicationAdherence.prescribedMedicinesCount > 0) {
    points.push(`Confirm prescription refills and review tolerance for your ${summary.medicationAdherence.prescribedMedicinesCount} active medicine(s).`);
  }

  // Task / Care Plan discussion point
  if (summary.carePlanProgress.overdueTasksCount > 0) {
    points.push(`Address ${summary.carePlanProgress.overdueTasksCount} overdue care activities and adjust task frequency if needed.`);
  }

  // Active insights
  const actionable = insights.filter((i) => i.isActionable && i.suggestedDiscussion);
  actionable.forEach((a) => {
    if (a.suggestedDiscussion && !points.includes(a.suggestedDiscussion)) {
      points.push(a.suggestedDiscussion);
    }
  });

  const textSummary = `Recommended Discussion Points for Your Doctor Consultation:
${points.map((p, idx) => `${idx + 1}. ${p}`).join('\n')}

Note: Damu assists in organizing your verified health logs for productive consultation discussions. Only your licensed physician can make treatment decisions.`;

  const sources: DamuSourceReference[] = [
    {
      type: 'CARE_PLAN',
      title: 'Consultation Discussion Points',
      reference: `DiscussionPoints:${patientId}`,
      content: `Derived from 30d glucose TIR (${summary.glucoseProgress.timeInRangePercentage}%), med adherence (${summary.medicationAdherence.adherenceRatePercentage}%), and active care tasks.`,
    },
  ];

  return {
    toolName: 'get_doctor_discussion_points',
    data: { points, summary },
    summary: textSummary,
    sources,
  };
}

/**
 * 14. explain_reminder (Phase 7)
 */
export async function explainReminderTool(
  patientId: string,
  query: string
): Promise<ToolExecutionOutput> {
  const summary = `Care Reminders in AarogyaDamu are scheduled directly from your doctor's prescribed care plan, medication schedules, or upcoming appointments.
• Medication Reminders: Help you remember doses at the exact times prescribed by your clinician.
• Care Task Reminders: Remind you to complete physician-assigned activities (like checking fasting sugars or foot care).
• Appointment Reminders: Ensure you don't miss scheduled clinical follow-up reviews.
You can configure your preferences, set quiet hours, or toggle push notifications anytime in your Profile Settings.`;

  const sources: DamuSourceReference[] = [
    {
      type: 'CARE_PLAN',
      title: 'Care Reminder Purpose & Clinical Alignment',
      reference: 'DoctorCarePlan:Reminders',
      content: 'Reminders align with doctor-prescribed medication schedules and active care tasks.',
    },
  ];

  return {
    toolName: 'explain_reminder',
    data: { patientId, query },
    summary,
    sources,
  };
}

