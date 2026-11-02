import { prisma } from '../server';

export interface DamuAssistantResult {
  reply: string;
  records?: {
    type: 'OBSERVATIONS' | 'APPOINTMENTS' | 'TASKS' | 'DOCUMENTS' | 'CARE_PLAN';
    items: Array<{
      id: string;
      title?: string;
      numericValue?: number;
      unit?: string;
      context?: string;
      observedAt?: string;
      scheduledAt?: string;
      dueAt?: string;
      details?: string;
    }>;
  };
  proposal?: {
    id: string;
    type: string;
    summaryText: string;
    payload: Record<string, unknown>;
  };
  guardrailTriggered?: boolean;
}

export async function processDamuPrompt(
  userId: string,
  prompt: string
): Promise<DamuAssistantResult> {
  const lower = (prompt || '').toLowerCase().trim();

  // 1. Clinical Safety Guardrail: Prevent independent diagnosis, prescription or dosage alteration
  if (
    lower.includes('diagnose') ||
    lower.includes('prescribe') ||
    lower.includes('change dose') ||
    lower.includes('change my dose') ||
    lower.includes('modify dose') ||
    lower.includes('alter dose') ||
    lower.includes('increase dose') ||
    lower.includes('decrease dose')
  ) {
    return {
      reply:
        'Clinical Guardrail Notice: As your care companion, Damu cannot independently diagnose conditions, prescribe medications, or alter clinical treatment dosages. Any modifications to your diabetes care plan or prescriptions must be authorized directly by your treating clinician. Please consult your doctor or schedule an appointment.',
      guardrailTriggered: true,
    };
  }

  // 2. Prepare Doctor-Review Summary
  if (
    lower.includes('doctor review') ||
    lower.includes('review summary') ||
    lower.includes('consultation summary') ||
    lower.includes('prepare review') ||
    lower.includes('doctor summary')
  ) {
    const [activePlan, recentObs, recentTasks] = await Promise.all([
      prisma.carePlan.findFirst({
        where: { patientId: userId, status: 'ACTIVE' },
        include: {
          goals: true,
          activities: true,
          doctor: { select: { profile: { select: { fullName: true } } } },
        },
        orderBy: { version: 'desc' },
      }),
      prisma.healthObservation.findMany({
        where: { userId, type: 'BLOOD_GLUCOSE' },
        orderBy: { observedAt: 'desc' },
        take: 5,
      }),
      prisma.careTask.findMany({
        where: { userId },
        orderBy: { dueAt: 'desc' },
        take: 10,
      }),
    ]);

    const doctorName = activePlan?.doctor?.profile?.fullName || 'Treating Clinician';
    const goalsList = activePlan?.goals?.length
      ? activePlan.goals.map((g) => `${g.title} (${g.targetValue} ${g.unit || ''})`).join('; ')
      : 'Maintain fasting blood sugar 80-130 mg/dL';
    const obsSummary = recentObs.length
      ? recentObs.map((o) => `${o.numericValue} ${o.unit} (${o.context.toLowerCase()})`).join(', ')
      : 'No recent readings logged';

    const completedCount = recentTasks.filter((t) => t.status === 'COMPLETED').length;
    const adherenceRate = recentTasks.length
      ? Math.round((completedCount / recentTasks.length) * 100)
      : 100;

    const reviewDateStr = activePlan?.reviewDate
      ? new Date(activePlan.reviewDate).toLocaleDateString('en-IN')
      : 'Next checkup';

    return {
      reply:
        `Here is your Doctor-Review Summary prepared for Dr. ${doctorName}:\n\n` +
        `• Active Plan: ${activePlan?.title || 'Shared Diabetes Care Plan'} (v${activePlan?.version || 1})\n` +
        `• Review Target Date: ${reviewDateStr}\n` +
        `• Glycemic Targets: ${goalsList}\n` +
        `• Recent Blood Glucose Logs: ${obsSummary}\n` +
        `• Task Adherence Rate: ${adherenceRate}% (${completedCount}/${recentTasks.length} tasks completed)\n` +
        `• Clinician Instructions: ${activePlan?.doctorInstructions || activePlan?.summary || 'Follow daily scheduled activities'}\n\n` +
        `This summary is compiled from your verified logs and ready for your doctor's review.`,
    };
  }

  // 3. Summarize Progress / Incomplete Tasks / Upcoming Activities
  if (
    lower.includes('progress') ||
    lower.includes('completion') ||
    lower.includes('incomplete') ||
    lower.includes('upcoming') ||
    lower.includes('activity') ||
    lower.includes('activities') ||
    lower.includes('pending task') ||
    lower.includes('what to do')
  ) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [activePlan, todayTasks] = await Promise.all([
      prisma.carePlan.findFirst({
        where: { patientId: userId, status: 'ACTIVE' },
        include: { activities: true, goals: true },
        orderBy: { version: 'desc' },
      }),
      prisma.careTask.findMany({
        where: {
          userId,
          dueAt: { gte: todayStart, lte: todayEnd },
        },
        orderBy: { dueAt: 'asc' },
      }),
    ]);

    const total = todayTasks.length;
    const completed = todayTasks.filter((t) => t.status === 'COMPLETED');
    const incomplete = todayTasks.filter((t) => t.status !== 'COMPLETED');
    const percentage = total > 0 ? Math.round((completed.length / total) * 100) : 100;

    let replyMsg = `Care Plan Progress Update: You have completed ${completed.length} of ${total} scheduled tasks today (${percentage}%).`;

    if (incomplete.length > 0) {
      const incompleteList = incomplete.map((t, idx) => `${idx + 1}. ${t.title}`).join(', ');
      replyMsg += ` Incomplete tasks remaining for today: ${incompleteList}.`;
    } else if (total > 0) {
      replyMsg += ` Excellent work! All scheduled tasks for today are completed.`;
    }

    if (activePlan?.activities?.length) {
      const upcomingList = activePlan.activities
        .map((a) => `${a.title} (${a.frequency.toLowerCase()}, ${a.timing || 'scheduled'})`)
        .join('; ');
      replyMsg += ` Upcoming care plan activities: ${upcomingList}.`;
    }

    return {
      reply: replyMsg,
      records: {
        type: 'TASKS',
        items: todayTasks.map((t) => ({
          id: t.id,
          title: t.title,
          details: `Status: ${t.status} • Category: ${t.category}`,
          dueAt: t.dueAt.toISOString(),
        })),
      },
    };
  }

  // 4. Explain Approved Care Plan Instructions & Goals
  if (
    lower.includes('care plan') ||
    lower.includes('careplan') ||
    lower.includes('instruction') ||
    lower.includes('goal') ||
    lower.includes('my plan')
  ) {
    const activePlan = await prisma.carePlan.findFirst({
      where: { patientId: userId, status: 'ACTIVE' },
      include: {
        goals: true,
        activities: true,
        doctor: { select: { profile: { select: { fullName: true } } } },
      },
      orderBy: { version: 'desc' },
    });

    if (!activePlan) {
      return {
        reply:
          'You do not have an active approved care plan yet. Once your doctor creates and approves your shared diabetes care plan, I will explain your instructions, goals, and daily schedule here.',
      };
    }

    const doctorName = activePlan.doctor?.profile?.fullName || 'Your Doctor';
    const goalsDesc = activePlan.goals.length
      ? activePlan.goals
          .map((g) => `• ${g.title}: Target ${g.targetValue} ${g.unit || ''} (${g.timeframe || 'Daily'})`)
          .join('\n')
      : '• Keep fasting glucose within 80-130 mg/dL';

    const activitiesDesc = activePlan.activities.length
      ? activePlan.activities
          .map(
            (a) =>
              `• ${a.title} [${a.frequency.toLowerCase()} - ${a.timing || 'routine'}]: ${a.instructions || 'Follow doctor guidance'}`
          )
          .join('\n')
      : '• Follow daily glucose checks and prescribed medication';

    const instructions = activePlan.doctorInstructions || activePlan.summary || 'Follow scheduled activities.';

    return {
      reply:
        `Here is an explanation of your approved Diabetes Care Plan (v${activePlan.version}), managed by Dr. ${doctorName}:\n\n` +
        `Clinical Instructions:\n"${instructions}"\n\n` +
        `Health Goals:\n${goalsDesc}\n\n` +
        `Daily Care Activities:\n${activitiesDesc}\n\n` +
        `Note: Damu explains your clinician-approved plan. Damu does not independently prescribe or modify medical treatment.`,
      records: {
        type: 'CARE_PLAN',
        items: activePlan.activities.map((a) => ({
          id: a.id,
          title: a.title,
          details: a.instructions || undefined,
        })),
      },
    };
  }

  // 5. Task / Reminder Scheduling Intent
  if (lower.includes('reminder') || lower.includes('remind') || lower.includes('task')) {
    const proposal = await prisma.assistantProposal.create({
      data: {
        userId,
        type: 'SCHEDULE_TASK',
        summaryText: 'Reminder: Check fasting blood glucose tomorrow morning at 8:00 AM',
        payload: JSON.stringify({
          title: 'Check fasting blood glucose',
          category: 'FOLLOW_UP',
          dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        }),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour expiration
      },
    });

    return {
      reply: 'I have prepared a follow-up care task. Because medical updates require confirmation, please review and approve below:',
      proposal: {
        id: proposal.id,
        type: proposal.type,
        summaryText: proposal.summaryText,
        payload: JSON.parse(proposal.payload),
      },
    };
  }

  // 6. Glucose / Blood Sugar Observations Intent
  if (lower.includes('sugar') || lower.includes('glucose') || lower.includes('reading') || lower.includes('hba1c')) {
    const observations = await prisma.healthObservation.findMany({
      where: { userId, type: 'BLOOD_GLUCOSE' },
      orderBy: { observedAt: 'desc' },
      take: 5,
    });

    if (observations.length === 0) {
      return {
        reply: 'No glucose checks are on record yet. You can log your first reading in the Sugar Checks tab.',
      };
    }

    const summary = observations
      .map((r) => `${r.numericValue} ${r.unit} (${r.context.toLowerCase().replace(/_/g, ' ')})`)
      .join(', ');

    return {
      reply: `Here are your recent blood sugar readings: ${summary}.`,
      records: {
        type: 'OBSERVATIONS',
        items: observations.map((r) => ({
          id: r.id,
          numericValue: r.numericValue,
          unit: r.unit,
          context: r.context,
          observedAt: r.observedAt.toISOString(),
        })),
      },
    };
  }

  // 7. Clinical Documents & Lab Reports Intent
  if (lower.includes('report') || lower.includes('document') || lower.includes('file') || lower.includes('prescription') || lower.includes('lab')) {
    const documents = await prisma.healthDocument.findMany({
      where: { userId },
      orderBy: { reportDate: 'desc' },
      take: 5,
    });

    if (documents.length === 0) {
      return {
        reply: 'No medical documents or lab reports have been uploaded yet.',
      };
    }

    return {
      reply: `Found ${documents.length} clinical record(s) on file:`,
      records: {
        type: 'DOCUMENTS',
        items: documents.map((doc) => ({
          id: doc.id,
          title: doc.title,
          details: `Category: ${doc.category} • Status: ${doc.processingStatus}${doc.issuingFacility ? ` • Facility: ${doc.issuingFacility}` : ''}`,
          observedAt: doc.reportDate.toISOString(),
        })),
      },
    };
  }

  // 8. Appointments & Doctor Visit Intent
  if (lower.includes('appointment') || lower.includes('doctor') || lower.includes('visit') || lower.includes('consult')) {
    const consultations = await prisma.consultationPrep.findMany({
      where: { userId },
      orderBy: { scheduledAt: 'desc' },
      take: 3,
    });

    if (consultations.length === 0) {
      return {
        reply: 'You have no doctor visits or consultations recorded. You can prepare for your next consultation in the Doctor Visit tab.',
      };
    }

    return {
      reply: `Here are your recorded doctor consultations:`,
      records: {
        type: 'APPOINTMENTS',
        items: consultations.map((c) => ({
          id: c.id,
          title: c.clinicianName,
          details: c.concernsAndQuestions,
          scheduledAt: c.scheduledAt.toISOString(),
        })),
      },
    };
  }

  // 9. Journey Stage & Milestone Progress Intelligence
  if (
    lower.includes('journey') ||
    lower.includes('stage') ||
    lower.includes('milestone') ||
    lower.includes('where am i') ||
    lower.includes('current step')
  ) {
    const [profile, firstObs, consultations, activePlan, recentObs, allPlans, appointments] = await Promise.all([
      prisma.patientProfile.findUnique({ where: { userId } }),
      prisma.healthObservation.findFirst({ where: { userId }, orderBy: { observedAt: 'asc' } }),
      prisma.consultationNote.findMany({ where: { userId, status: 'APPROVED' }, take: 1 }),
      prisma.carePlan.findFirst({ where: { patientId: userId, status: 'ACTIVE' }, orderBy: { version: 'desc' } }),
      prisma.healthObservation.findMany({ where: { userId }, orderBy: { observedAt: 'desc' }, take: 5 }),
      prisma.carePlan.findMany({ where: { patientId: userId } }),
      prisma.appointment.findMany({ where: { patientId: userId }, orderBy: { scheduledAt: 'asc' } }),
    ]);

    const completedMilestones: string[] = [];
    if (profile) completedMilestones.push('Patient Onboarding');
    if (firstObs) completedMilestones.push('Initial Health Assessment');
    if (consultations.length > 0) completedMilestones.push('Doctor Consultation');
    if (activePlan || allPlans.some((p) => p.status === 'SUPERSEDED')) completedMilestones.push(`Care Plan Approval (v${activePlan?.version || 1})`);
    if (recentObs.length > 0) completedMilestones.push('Daily Health Monitoring');
    if (recentObs.length >= 3) completedMilestones.push('Progress Evaluation');
    if (allPlans.length > 1 && allPlans.some((p) => p.version > 1 && p.status === 'ACTIVE')) completedMilestones.push('Care Plan Revision');

    let currentStage = 'Daily Health Monitoring & Routine Activities';
    if (!profile) currentStage = 'Patient Onboarding';
    else if (!firstObs) currentStage = 'Initial Health Assessment';
    else if (consultations.length === 0) currentStage = 'Doctor Consultation';
    else if (!activePlan) currentStage = 'Care Plan Approval';

    const upcomingAppt = appointments.find((a) => new Date(a.scheduledAt).getTime() >= Date.now());
    const reviewDateStr = activePlan?.reviewDate ? new Date(activePlan.reviewDate).toLocaleDateString('en-IN') : null;

    return {
      reply:
        `Your Diabetes Care Journey Overview:\n\n` +
        `• Current Stage: ${currentStage}\n` +
        `• Completed Milestones (${completedMilestones.length} of 9): ${completedMilestones.join(', ')}\n` +
        (reviewDateStr ? `• Next Clinical Review Date: ${reviewDateStr}\n` : '') +
        (upcomingAppt ? `• Next Appointment: ${new Date(upcomingAppt.scheduledAt).toLocaleDateString('en-IN')} (${upcomingAppt.status === 'CONFIRMED' ? 'Confirmed by Clinic' : 'Request Pending'})\n` : '') +
        `\nKeep logging your morning glucose and completing your routine tasks to maintain steady glycemic control.`,
    };
  }

  // 10. Missing Health Records & Screening Gaps
  if (
    lower.includes('missing') ||
    lower.includes('gap') ||
    lower.includes('overdue record') ||
    lower.includes('what records') ||
    lower.includes('missing records')
  ) {
    const now = Date.now();
    const ninetyDaysAgo = new Date(now - 90 * 86400000);
    const sevenDaysAgo = new Date(now - 7 * 86400000);

    const [recentGlucose, recentHba1c, recentBp, pendingDocs] = await Promise.all([
      prisma.healthObservation.findFirst({ where: { userId, type: 'BLOOD_GLUCOSE', observedAt: { gte: sevenDaysAgo } } }),
      prisma.healthObservation.findFirst({ where: { userId, type: 'HBA1C', observedAt: { gte: ninetyDaysAgo } } }),
      prisma.healthObservation.findFirst({ where: { userId, type: { startsWith: 'BLOOD_PRESSURE' }, observedAt: { gte: ninetyDaysAgo } } }),
      prisma.healthDocument.findMany({ where: { userId, processingStatus: 'PENDING' } }),
    ]);

    const missingGaps: string[] = [];
    if (!recentGlucose) missingGaps.push('Recent self-monitored blood glucose (none logged in the past 7 days)');
    if (!recentHba1c) missingGaps.push('Quarterly laboratory HbA1c test (no record in the past 90 days)');
    if (!recentBp) missingGaps.push('Blood pressure screening reading (recommended periodically)');
    if (pendingDocs.length > 0) missingGaps.push(`${pendingDocs.length} health report document(s) pending processing`);

    if (missingGaps.length === 0) {
      return {
        reply: 'Great news! Your diabetes health records are fully up to date. You have regular glucose logs, an active HbA1c reading on file, and no missing documentation.',
      };
    }

    return {
      reply:
        `Here is an audit of your health record status and upcoming screening recommendations:\n\n` +
        missingGaps.map((gap, idx) => `${idx + 1}. ${gap}`).join('\n') +
        `\n\nMaintaining complete longitudinal records helps your treating clinician optimize your care plan.`,
    };
  }

  // 11. Safe Default Fallback
  return {
    reply:
      "Namaste! I am Damu, your personal care continuity companion. I can explain your current journey stage, summarize completed milestones, explain your approved care plan, identify missing health records, or prepare doctor-review summaries. I do not independently diagnose or alter prescribed dosages.",
  };
}