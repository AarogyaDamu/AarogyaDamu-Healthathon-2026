import { prisma } from '../db/prisma';

export interface DigitalHealthTwinPayload {
  patientId: string;
  generatedAt: string;
  governance: {
    approvalStatus: 'PENDING_CLINICIAN_APPROVAL';
    isReadOnly: true;
    prescribingAutonomous: false;
    disclaimer: string;
    causationNotice: string;
  };
  metrics: {
    vitals: {
      hasData: boolean;
      glucose: {
        readingsCount: number;
        meanMgDl: number | null;
        timeInRangePercent: number | null;
        lastReading: {
          value: number;
          unit: string;
          context: string;
          observedAt: string;
          sourceProvenance: string;
        } | null;
      };
      bloodPressure: {
        lastReading: {
          systolic: number;
          diastolic: number;
          unit: string;
          observedAt: string;
          sourceProvenance: string;
        } | null;
      };
      hba1c: {
        lastReading: {
          value: number;
          unit: string;
          observedAt: string;
          sourceProvenance: string;
        } | null;
      };
    };
    lifestyle: {
      hasData: boolean;
      physicalActivity: {
        totalWeeklyMinutes: number;
        sessionsCount: number;
        lastLoggedAt: string | null;
      };
      sleep: {
        averageHoursPerNight: number | null;
        nightsRecorded: number;
        lastLoggedAt: string | null;
      };
      hydration: {
        dailyAverageMl: number | null;
        daysLogged: number;
      };
      wellbeing: {
        recentStatus: string | null;
        lastLoggedAt: string | null;
      };
    };
    medications: {
      activeCount: number;
      unreviewedCount: number;
      adherenceRate14d: number | null;
      trackedDosesCount: number;
    };
    carePlan: {
      hasActivePlan: boolean;
      planTitle: string | null;
      planVersion: number | null;
      completedTasksCount: number;
      totalTasksCount: number;
      progressPercent: number;
    };
  };
  dataQualityAlerts: Array<{
    code: string;
    message: string;
    severity: 'INFO' | 'WARNING';
  }>;
  dataFreshness: {
    lastObservationAt: string | null;
    lastLifestyleAt: string | null;
    lastMedicationAdherenceAt: string | null;
  };
}

export async function generateDigitalHealthTwin(patientId: string): Promise<DigitalHealthTwinPayload> {
  const now = new Date();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  // 1. Fetch Health Observations (14 days)
  const observations = await prisma.healthObservation.findMany({
    where: {
      userId: patientId,
      observedAt: { gte: fourteenDaysAgo },
    },
    orderBy: { observedAt: 'desc' },
  });

  const allObservations = observations.length > 0 ? observations : await prisma.healthObservation.findMany({
    where: { userId: patientId },
    orderBy: { observedAt: 'desc' },
    take: 50,
  });

  const glucoseObs = allObservations.filter((o) => o.type === 'BLOOD_GLUCOSE');
  const bpObs = allObservations.filter((o) => o.type === 'BLOOD_PRESSURE');
  const hba1cObs = allObservations.filter((o) => o.type === 'HBA1C');

  let meanGlucose: number | null = null;
  let tirPercent: number | null = null;

  if (glucoseObs.length > 0) {
    const sum = glucoseObs.reduce((acc, curr) => acc + curr.numericValue, 0);
    meanGlucose = Math.round((sum / glucoseObs.length) * 10) / 10;
    const inRange = glucoseObs.filter((o) => o.numericValue >= 70 && o.numericValue <= 180).length;
    tirPercent = Math.round((inRange / glucoseObs.length) * 100);
  }

  // 2. Fetch Lifestyle Records (7 days)
  const lifestyleRecords = await prisma.lifestyleRecord.findMany({
    where: {
      userId: patientId,
      recordedAt: { gte: sevenDaysAgo },
    },
    orderBy: { recordedAt: 'desc' },
  });

  const allLifestyle = lifestyleRecords.length > 0 ? lifestyleRecords : await prisma.lifestyleRecord.findMany({
    where: { userId: patientId },
    orderBy: { recordedAt: 'desc' },
    take: 50,
  });

  const activityRecords = allLifestyle.filter((r) => r.category === 'PHYSICAL_ACTIVITY');
  const sleepRecords = allLifestyle.filter((r) => r.category === 'SLEEP');
  const hydrationRecords = allLifestyle.filter((r) => r.category === 'HYDRATION');
  const wellbeingRecords = allLifestyle.filter((r) => r.category === 'WELLBEING');

  const totalWeeklyActivityMins = activityRecords.reduce(
    (acc, curr) => acc + (curr.numericValue || 0),
    0
  );

  let avgSleepHours: number | null = null;
  if (sleepRecords.length > 0) {
    const sleepSum = sleepRecords.reduce((acc, curr) => acc + (curr.numericValue || 0), 0);
    avgSleepHours = Math.round((sleepSum / sleepRecords.length) * 10) / 10;
  }

  let avgHydrationMl: number | null = null;
  if (hydrationRecords.length > 0) {
    const hydSum = hydrationRecords.reduce((acc, curr) => acc + (curr.numericValue || 0), 0);
    avgHydrationMl = Math.round(hydSum / hydrationRecords.length);
  }

  // 3. Fetch Medications & Adherence (14 days)
  const [medications, adherenceEvents] = await Promise.all([
    prisma.medicationSchedule.findMany({
      where: { userId: patientId },
    }),
    prisma.medicationAdherenceEvent.findMany({
      where: {
        userId: patientId,
        recordedAt: { gte: fourteenDaysAgo },
      },
      orderBy: { recordedAt: 'desc' },
    }),
  ]);

  const activeMeds = medications.filter((m) => m.status === 'ACTIVE' || (m.status as any) === null);
  const unreviewedMeds = medications.filter((m) => m.reviewStatus === 'UNREVIEWED');

  let adherenceRate: number | null = null;
  if (adherenceEvents.length > 0) {
    const takenCount = adherenceEvents.filter((e) => e.action === 'TAKEN').length;
    adherenceRate = Math.round((takenCount / adherenceEvents.length) * 100);
  }

  // 4. Fetch Active Care Plan & Tasks
  const activePlan = await prisma.carePlan.findFirst({
    where: {
      patientId,
      status: 'ACTIVE',
    },
    include: {
      tasks: true,
    },
    orderBy: { version: 'desc' },
  });

  let completedTasks = 0;
  let totalTasks = 0;
  let taskProgressPercent = 0;

  if (activePlan && activePlan.tasks) {
    totalTasks = activePlan.tasks.length;
    completedTasks = activePlan.tasks.filter((t) => t.status === 'COMPLETED').length;
    taskProgressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  }

  // 5. Build Data Quality & Recency Warnings
  const alerts: Array<{ code: string; message: string; severity: 'INFO' | 'WARNING' }> = [];

  const latestGlucose = glucoseObs[0] || null;
  if (!latestGlucose) {
    alerts.push({
      code: 'NO_GLUCOSE_RECORDED',
      message: 'No blood glucose readings have been recorded yet.',
      severity: 'WARNING',
    });
  } else if (new Date(latestGlucose.observedAt).getTime() < fortyEightHoursAgo.getTime()) {
    alerts.push({
      code: 'NO_GLUCOSE_RECORDED_48H',
      message: 'No blood glucose recorded in over 48 hours. Consider logging your fasting sugar.',
      severity: 'WARNING',
    });
  } else if (glucoseObs.length < 3) {
    alerts.push({
      code: 'INSUFFICIENT_DATA_FOR_TRENDS',
      message: 'At least 3 glucose logs are recommended for reliable ambulatory patterns.',
      severity: 'INFO',
    });
  }

  if (sleepRecords.length === 0) {
    alerts.push({
      code: 'NO_SLEEP_RECORDED_7D',
      message: 'No sleep records logged in the last 7 days.',
      severity: 'INFO',
    });
  }

  if (unreviewedMeds.length > 0) {
    alerts.push({
      code: 'UNREVIEWED_MEDICATIONS_PRESENT',
      message: `You have ${unreviewedMeds.length} self-reported medication(s) awaiting clinical verification.`,
      severity: 'INFO',
    });
  }

  return {
    patientId,
    generatedAt: now.toISOString(),
    governance: {
      approvalStatus: 'PENDING_CLINICIAN_APPROVAL',
      isReadOnly: true,
      prescribingAutonomous: false,
      disclaimer: 'The Digital Health Twin is a read-only informational aggregation of your recorded data. It does not provide medical diagnoses, treatment decisions, or autonomous therapy adjustments. Status: PENDING_CLINICIAN_APPROVAL.',
      causationNotice: 'Observed patterns and trends do not imply clinical causation.',
    },
    metrics: {
      vitals: {
        hasData: allObservations.length > 0,
        glucose: {
          readingsCount: glucoseObs.length,
          meanMgDl: meanGlucose,
          timeInRangePercent: tirPercent,
          lastReading: latestGlucose
            ? {
                value: latestGlucose.numericValue,
                unit: latestGlucose.unit,
                context: latestGlucose.context,
                observedAt: latestGlucose.observedAt.toISOString(),
                sourceProvenance: latestGlucose.sourceProvenance || 'MANUAL_PATIENT',
              }
            : null,
        },
        bloodPressure: {
          lastReading: bpObs[0]
            ? {
                systolic: bpObs[0].numericValue,
                diastolic: bpObs[0].secondaryValue || 0,
                unit: bpObs[0].unit,
                observedAt: bpObs[0].observedAt.toISOString(),
                sourceProvenance: bpObs[0].sourceProvenance || 'MANUAL_PATIENT',
              }
            : null,
        },
        hba1c: {
          lastReading: hba1cObs[0]
            ? {
                value: hba1cObs[0].numericValue,
                unit: hba1cObs[0].unit,
                observedAt: hba1cObs[0].observedAt.toISOString(),
                sourceProvenance: hba1cObs[0].sourceProvenance || 'MANUAL_PATIENT',
              }
            : null,
        },
      },
      lifestyle: {
        hasData: allLifestyle.length > 0,
        physicalActivity: {
          totalWeeklyMinutes: totalWeeklyActivityMins,
          sessionsCount: activityRecords.length,
          lastLoggedAt: activityRecords[0]?.recordedAt.toISOString() || null,
        },
        sleep: {
          averageHoursPerNight: avgSleepHours,
          nightsRecorded: sleepRecords.length,
          lastLoggedAt: sleepRecords[0]?.recordedAt.toISOString() || null,
        },
        hydration: {
          dailyAverageMl: avgHydrationMl,
          daysLogged: hydrationRecords.length,
        },
        wellbeing: {
          recentStatus: wellbeingRecords[0]?.qualitativeValue || null,
          lastLoggedAt: wellbeingRecords[0]?.recordedAt.toISOString() || null,
        },
      },
      medications: {
        activeCount: activeMeds.length,
        unreviewedCount: unreviewedMeds.length,
        adherenceRate14d: adherenceRate,
        trackedDosesCount: adherenceEvents.length,
      },
      carePlan: {
        hasActivePlan: !!activePlan,
        planTitle: activePlan?.title || null,
        planVersion: activePlan?.version || null,
        completedTasksCount: completedTasks,
        totalTasksCount: totalTasks,
        progressPercent: taskProgressPercent,
      },
    },
    dataQualityAlerts: alerts,
    dataFreshness: {
      lastObservationAt: allObservations[0]?.observedAt.toISOString() || null,
      lastLifestyleAt: allLifestyle[0]?.recordedAt.toISOString() || null,
      lastMedicationAdherenceAt: adherenceEvents[0]?.recordedAt.toISOString() || null,
    },
  };
}
