import { prisma } from '../db/prisma';
import {
  CgmProvider,
  CgmConnectionStatus,
  CgmTrendArrow,
  CgmTargetSettings,
  CgmMetricsSummary,
  LOINC_CGM_CODES,
} from '@aarogyadamu/contracts';

export interface RawCsvReading {
  timestamp: string; // ISO or 'YYYY-MM-DD HH:mm:ss'
  glucoseValue: number;
  unit?: 'mg/dL' | 'mmol/L';
  trendArrow?: CgmTrendArrow;
}

export class CgmService {
  /**
   * Standard conversion: 1 mmol/L = 18.0182 mg/dL
   */
  static mmolToMgDl(mmol: number): number {
    return Math.round(mmol * 18.0182 * 10) / 10;
  }

  static mgDlToMmol(mgDl: number): number {
    return Math.round((mgDl / 18.0182) * 10) / 10;
  }

  /**
   * Calculates GMI using standard clinical formula:
   * GMI (%) = 3.31 + (0.02392 * meanGlucoseMgDl)
   */
  static calculateGmi(meanGlucoseMgDl: number): number {
    if (meanGlucoseMgDl <= 0) return 0;
    const gmi = 3.31 + 0.02392 * meanGlucoseMgDl;
    return Math.round(gmi * 10) / 10;
  }

  /**
   * Calculates standard deviation and Coefficient of Variation (CV %):
   * CV (%) = (Standard Deviation / Mean) * 100
   */
  static calculateVariability(values: number[]): { standardDeviation: number; cvPercent: number } {
    if (values.length < 2) return { standardDeviation: 0, cvPercent: 0 };
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1);
    const sd = Math.sqrt(variance);
    const cv = mean > 0 ? (sd / mean) * 100 : 0;
    return {
      standardDeviation: Math.round(sd * 10) / 10,
      cvPercent: Math.round(cv * 10) / 10,
    };
  }

  /**
   * Ingests a stream of glucose readings with duplicate prevention and idempotency.
   */
  static async ingestReadings(
    patientId: string,
    readings: Array<{
      glucoseValue: number;
      unit?: 'mg/dL' | 'mmol/L';
      observedAt: Date;
      trendArrow?: CgmTrendArrow;
      deviceConnectionId?: string;
      sourceTimezone?: string;
    }>,
  ): Promise<{ ingestedCount: number; duplicateCount: number }> {
    let ingestedCount = 0;
    let duplicateCount = 0;

    for (const r of readings) {
      const isMmol = r.unit === 'mmol/L' || r.glucoseValue < 35;
      const mgDl = isMmol ? this.mmolToMgDl(r.glucoseValue) : Math.round(r.glucoseValue);
      const mmol = isMmol ? Math.round(r.glucoseValue * 10) / 10 : this.mgDlToMmol(r.glucoseValue);

      // Clamp biologically impossible readings to outlier flag
      const isOutlier = mgDl < 30 || mgDl > 500;
      const quality = isOutlier ? 'SUSPICIOUS' : 'VALID';

      const idempotencyKey = `${patientId}_${r.observedAt.toISOString()}_${mgDl}`;

      try {
        await prisma.cgmGlucoseReading.upsert({
          where: { idempotencyKey },
          create: {
            patientId,
            deviceConnectionId: r.deviceConnectionId || null,
            glucoseValueMgDl: mgDl,
            glucoseValueMmolL: mmol,
            unit: 'mg/dL',
            trendArrow: r.trendArrow || 'FLAT',
            readingType: 'INTERSTITIAL_CGM',
            loincCode: LOINC_CGM_CODES.INTERSTITIAL_GLUCOSE,
            observedAt: r.observedAt,
            sourceTimezone: r.sourceTimezone || 'Asia/Kolkata',
            isOutlier,
            dataQualityStatus: quality,
            idempotencyKey,
          },
          update: {},
        });
        ingestedCount++;
      } catch {
        duplicateCount++;
      }
    }

    return { ingestedCount, duplicateCount };
  }

  /**
   * Computes comprehensive CGM metrics according to the International Consensus on Time in Range:
   * - TIR: 70–180 mg/dL (target > 70%)
   * - TBR: < 70 mg/dL (target < 4%), very low < 54 mg/dL (target < 1%)
   * - TAR: > 180 mg/dL (target < 25%), very high > 250 mg/dL (target < 5%)
   * - GMI & CV
   * - Pregnancy adjustments supported (63–140 mg/dL)
   */
  static async computeMetrics(
    patientId: string,
    timeframe: '24h' | '7d' | '14d' | '30d' | '90d' | 'custom',
    customRange?: { startDate: Date; endDate: Date },
    targetSettings?: Partial<CgmTargetSettings>,
  ): Promise<CgmMetricsSummary> {
    const end = customRange?.endDate || new Date();
    let days = 14;
    if (timeframe === '24h') days = 1;
    else if (timeframe === '7d') days = 7;
    else if (timeframe === '14d') days = 14;
    else if (timeframe === '30d') days = 30;
    else if (timeframe === '90d') days = 90;

    const start = customRange?.startDate || new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

    const targets: CgmTargetSettings = {
      targetType: targetSettings?.targetType || 'STANDARD_T2D',
      targetLowMgDl: targetSettings?.targetLowMgDl || (targetSettings?.targetType === 'PREGNANCY_GDM' ? 63 : 70),
      targetHighMgDl: targetSettings?.targetHighMgDl || (targetSettings?.targetType === 'PREGNANCY_GDM' ? 140 : 180),
      urgentLowMgDl: targetSettings?.urgentLowMgDl || (targetSettings?.targetType === 'PREGNANCY_GDM' ? 54 : 54),
      urgentHighMgDl: targetSettings?.urgentHighMgDl || 250,
    };

    // Query readings in range
    const readings = await prisma.cgmGlucoseReading.findMany({
      where: {
        patientId,
        observedAt: { gte: start, lte: end },
        dataQualityStatus: 'VALID',
      },
      orderBy: { observedAt: 'asc' },
    });

    const totalReadingsCount = readings.length;
    // Expected readings: CGM records every 5 minutes = 288 readings per 24 hours
    const totalMinutes = Math.max(1, (end.getTime() - start.getTime()) / (60 * 1000));
    const expectedReadingsCount = Math.round(totalMinutes / 5);
    const dataCoveragePercent = Math.min(
      100,
      expectedReadingsCount > 0 ? Math.round((totalReadingsCount / expectedReadingsCount) * 1000) / 10 : 0,
    );

    if (totalReadingsCount === 0) {
      return {
        patientId,
        timeframe,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        totalReadingsCount: 0,
        expectedReadingsCount,
        dataCoveragePercent: 0,
        meanGlucoseMgDl: 0,
        gmiPercent: 0,
        cvPercent: 0,
        standardDeviation: 0,
        timeInRangePercent: 0,
        timeBelowRangePercent: 0,
        veryLowRangePercent: 0,
        timeAboveRangePercent: 0,
        veryHighRangePercent: 0,
        hypoEventsCount: 0,
        hyperEventsCount: 0,
        targetSettings: targets,
        latestReading: null,
        deviceInfo: null,
      };
    }

    const values = readings.map((r) => r.glucoseValueMgDl);
    const sum = values.reduce((acc, v) => acc + v, 0);
    const meanGlucoseMgDl = Math.round((sum / totalReadingsCount) * 10) / 10;
    const gmiPercent = this.calculateGmi(meanGlucoseMgDl);
    const { standardDeviation, cvPercent } = this.calculateVariability(values);

    let veryLowCount = 0;
    let lowCount = 0;
    let inRangeCount = 0;
    let highCount = 0;
    let veryHighCount = 0;

    let hypoEventsCount = 0;
    let hyperEventsCount = 0;
    let inHypoStreak = false;
    let inHyperStreak = false;

    for (const v of values) {
      if (v < targets.urgentLowMgDl) {
        veryLowCount++;
        lowCount++;
        if (!inHypoStreak) {
          hypoEventsCount++;
          inHypoStreak = true;
        }
      } else if (v < targets.targetLowMgDl) {
        lowCount++;
        if (!inHypoStreak) {
          hypoEventsCount++;
          inHypoStreak = true;
        }
      } else {
        inHypoStreak = false;
      }

      if (v > targets.urgentHighMgDl) {
        veryHighCount++;
        highCount++;
        if (!inHyperStreak) {
          hyperEventsCount++;
          inHyperStreak = true;
        }
      } else if (v > targets.targetHighMgDl) {
        highCount++;
        if (!inHyperStreak) {
          hyperEventsCount++;
          inHyperStreak = true;
        }
      } else {
        inHyperStreak = false;
      }

      if (v >= targets.targetLowMgDl && v <= targets.targetHighMgDl) {
        inRangeCount++;
      }
    }

    const timeInRangePercent = Math.round((inRangeCount / totalReadingsCount) * 1000) / 10;
    const timeBelowRangePercent = Math.round((lowCount / totalReadingsCount) * 1000) / 10;
    const veryLowRangePercent = Math.round((veryLowCount / totalReadingsCount) * 1000) / 10;
    const timeAboveRangePercent = Math.round((highCount / totalReadingsCount) * 1000) / 10;
    const veryHighRangePercent = Math.round((veryHighCount / totalReadingsCount) * 1000) / 10;

    const latest = readings[readings.length - 1];
    let statusLabel = 'In Range';
    if (latest.glucoseValueMgDl < targets.urgentLowMgDl) statusLabel = 'Very Low';
    else if (latest.glucoseValueMgDl < targets.targetLowMgDl) statusLabel = 'Low';
    else if (latest.glucoseValueMgDl > targets.urgentHighMgDl) statusLabel = 'Very High';
    else if (latest.glucoseValueMgDl > targets.targetHighMgDl) statusLabel = 'High';

    // Get active device info
    const device = await prisma.cgmDeviceConnection.findFirst({
      where: { patientId, connectionStatus: 'CONNECTED' },
      orderBy: { lastSyncAt: 'desc' },
    });

    return {
      patientId,
      timeframe,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      totalReadingsCount,
      expectedReadingsCount,
      dataCoveragePercent,
      meanGlucoseMgDl,
      gmiPercent,
      cvPercent,
      standardDeviation,
      timeInRangePercent,
      timeBelowRangePercent,
      veryLowRangePercent,
      timeAboveRangePercent,
      veryHighRangePercent,
      hypoEventsCount,
      hyperEventsCount,
      targetSettings: targets,
      latestReading: {
        glucoseValueMgDl: latest.glucoseValueMgDl,
        trendArrow: (latest.trendArrow as any) || 'FLAT',
        observedAt: latest.observedAt.toISOString(),
        statusLabel,
      },
      deviceInfo: device
        ? {
            provider: device.provider as CgmProvider,
            deviceName: device.deviceName,
            connectionStatus: device.connectionStatus as CgmConnectionStatus,
            lastSyncAt: device.lastSyncAt ? device.lastSyncAt.toISOString() : null,
          }
        : null,
    };
  }

  /**
   * Parses CSV exports from FreeStyle Libre or Dexcom Clarity.
   */
  static parseCgmCsv(csvContent: string): RawCsvReading[] {
    const lines = csvContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return [];

    const header = lines[0].toLowerCase();
    const isLibre = header.includes('meter') || header.includes('historic glucose') || header.includes('scan glucose');
    const isDexcom = header.includes('glucose value') || header.includes('transmitter time');

    const results: RawCsvReading[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const cols = line.split(',').map((c) => c.replace(/^"|"$/g, '').trim());

      let timestampStr = '';
      let val = 0;
      let trend: CgmTrendArrow = 'FLAT';

      if (isLibre && cols.length >= 5) {
        // Typical Libre format: Device, Serial, Timestamp (DD-MM-YYYY HH:mm), Record Type, Historic Glucose, Scan Glucose
        timestampStr = cols[2];
        const histGlucose = parseFloat(cols[4]);
        const scanGlucose = parseFloat(cols[5]);
        val = !isNaN(histGlucose) && histGlucose > 0 ? histGlucose : scanGlucose;
      } else if (isDexcom && cols.length >= 3) {
        // Typical Dexcom Clarity format: Timestamp, Event Type, Glucose Value (mg/dL)
        timestampStr = cols[1] || cols[0];
        val = parseFloat(cols[7] || cols[2] || cols[1]);
        const trendStr = (cols[8] || '').toLowerCase();
        if (trendStr.includes('doubleup')) trend = 'DOUBLE_UP';
        else if (trendStr.includes('singleup')) trend = 'SINGLE_UP';
        else if (trendStr.includes('fortyfiveup')) trend = 'FORTY_FIVE_UP';
        else if (trendStr.includes('flat')) trend = 'FLAT';
        else if (trendStr.includes('fortyfivedown')) trend = 'FORTY_FIVE_DOWN';
        else if (trendStr.includes('singledown')) trend = 'SINGLE_DOWN';
        else if (trendStr.includes('doubledown')) trend = 'DOUBLE_DOWN';
      } else {
        // Generic fallback format: Timestamp, Glucose
        timestampStr = cols[0];
        val = parseFloat(cols[1]);
      }

      if (!isNaN(val) && val > 0 && timestampStr) {
        results.push({
          timestamp: timestampStr,
          glucoseValue: val,
          unit: val < 35 ? 'mmol/L' : 'mg/dL',
          trendArrow: trend,
        });
      }
    }

    return results;
  }

  /**
   * Generates a FHIR R4 Observation resource representation for a CGM reading.
   */
  static toFhirR4Observation(reading: {
    id: string;
    patientId: string;
    glucoseValueMgDl: number;
    observedAt: Date;
    unit: string;
    trendArrow?: string | null;
  }) {
    return {
      resourceType: 'Observation',
      id: reading.id,
      status: 'final',
      category: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/observation-category',
              code: 'vital-signs',
              display: 'Vital Signs',
            },
          ],
        },
      ],
      code: {
        coding: [
          {
            system: 'http://loinc.org',
            code: LOINC_CGM_CODES.INTERSTITIAL_GLUCOSE,
            display: 'Glucose [Mass/volume] in Interstitial fluid',
          },
        ],
        text: 'Continuous Glucose Monitoring (CGM) Reading',
      },
      subject: {
        reference: `Patient/${reading.patientId}`,
      },
      effectiveDateTime: reading.observedAt.toISOString(),
      valueQuantity: {
        value: reading.glucoseValueMgDl,
        unit: 'mg/dL',
        system: 'http://unitsofmeasure.org',
        code: 'mg/dL',
      },
      interpretation: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
              code:
                reading.glucoseValueMgDl < 70
                  ? 'L'
                  : reading.glucoseValueMgDl > 180
                    ? 'H'
                    : 'N',
              display:
                reading.glucoseValueMgDl < 70
                  ? 'Low'
                  : reading.glucoseValueMgDl > 180
                    ? 'High'
                    : 'Normal',
            },
          ],
        },
      ],
      component: reading.trendArrow
        ? [
            {
              code: {
                text: 'Trend Arrow',
              },
              valueString: reading.trendArrow,
            },
          ]
        : [],
    };
  }

  /**
   * Ensures synthetic CGM test data exists for a demo patient (e.g. Ramesh)
   * so both patient and doctor interfaces render real data trends immediately.
   */
  static async seedDemoCgmDataIfEmpty(patientId: string): Promise<void> {
    const existing = await prisma.cgmGlucoseReading.count({
      where: { patientId },
    });

    if (existing >= 100) return;

    // Create device connection if not present
    let device = await prisma.cgmDeviceConnection.findFirst({
      where: { patientId, provider: 'ABBOTT_LIBRE' },
    });

    if (!device) {
      device = await prisma.cgmDeviceConnection.create({
        data: {
          patientId,
          provider: 'ABBOTT_LIBRE',
          connectionStatus: 'CONNECTED',
          deviceName: 'FreeStyle Libre 3 Sensor',
          deviceModel: 'Libre 3 (FSL-3-IND)',
          serialNumber: 'L3-984210-2026',
          lastSyncAt: new Date(),
          metadataJson: JSON.stringify({
            sensorWarmupComplete: true,
            sampleIntervalMinutes: 15,
            firmwareVersion: '2.4.1',
          }),
        },
      });
    }

    const now = new Date();
    const readings: Array<{
      glucoseValue: number;
      observedAt: Date;
      trendArrow: CgmTrendArrow;
      deviceConnectionId: string;
    }> = [];

    // Generate 14 days of realistic readings every 30 minutes (672 data points)
    // Baseline around 110-130 mg/dL, post-meal peaks around 150-175, rare dips to 68-75
    for (let i = 14 * 48; i >= 0; i--) {
      const observedAt = new Date(now.getTime() - i * 30 * 60 * 1000);
      const hour = observedAt.getHours();

      let base = 112;
      let trend: CgmTrendArrow = 'FLAT';

      // Meal responses
      if (hour >= 8 && hour <= 10) {
        // Breakfast peak
        base = 145 + Math.sin((hour - 8) * Math.PI) * 25;
        trend = hour === 8 ? 'FORTY_FIVE_UP' : 'FORTY_FIVE_DOWN';
      } else if (hour >= 13 && hour <= 15) {
        // Lunch peak
        base = 155 + Math.sin((hour - 13) * Math.PI) * 22;
        trend = hour === 13 ? 'FORTY_FIVE_UP' : 'FLAT';
      } else if (hour >= 20 && hour <= 22) {
        // Dinner peak
        base = 148 + Math.sin((hour - 20) * Math.PI) * 20;
        trend = hour === 20 ? 'FORTY_FIVE_UP' : 'FORTY_FIVE_DOWN';
      } else if (hour >= 2 && hour <= 4) {
        // Nocturnal dip
        base = 92 + Math.sin((hour - 2) * Math.PI) * 10;
        trend = 'FLAT';
      }

      // Add mild pseudo-random variation
      const jitter = ((i * 17) % 19) - 9;
      const glucoseValue = Math.max(65, Math.min(235, Math.round(base + jitter)));

      readings.push({
        glucoseValue,
        observedAt,
        trendArrow: trend,
        deviceConnectionId: device.id,
      });
    }

    await this.ingestReadings(patientId, readings);
  }
}

