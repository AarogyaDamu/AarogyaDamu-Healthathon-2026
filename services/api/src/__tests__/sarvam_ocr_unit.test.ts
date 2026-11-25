import { SarvamOcrService } from '../services/sarvamOcrService';

describe('SarvamOcrService — Dual-Engine & Structured Clinical Lab Extraction Unit Suite', () => {
  const sampleLabText = `
METROPOLIS ADVANCED HEALTHCARE & DIABETES CARE LAB
Patient: Ramesh Patel (Age: 52, Gender: M)
Referral: Dr. Rupam Choudhary (Diabetologist)
Specimen: Venous Blood & Fluoride Plasma
Date of Collection: 2026-11-18

DIABETES & GLYCEMIC PROFILE
------------------------------------------------------------
• Glycosylated Hemoglobin (HbA1c): 7.2 % [Reference: < 5.7 Normal, 5.7-6.4 Prediabetes, >= 6.5 Diabetes]
• Estimated Average Glucose (eAG): 160 mg/dL
• Fasting Blood Glucose (FBG): 124 mg/dL [Reference: 70 - 100 mg/dL]
• Post-Prandial Blood Glucose (2 Hr PP): 168 mg/dL [Reference: < 140 mg/dL]

RENAL FUNCTION PANEL
------------------------------------------------------------
• Serum Creatinine: 1.1 mg/dL [Reference: 0.7 - 1.3 mg/dL]
• Estimated GFR (CKD-EPI): 82 mL/min/1.73m2 [Reference: > 60 mL/min]
• Urine Microalbumin: 28 mg/L [Reference: < 30 mg/L Normal]

LIPID PROFILE
------------------------------------------------------------
• Total Cholesterol: 185 mg/dL [Desirable: < 200 mg/dL]
• Triglycerides: 160 mg/dL [Normal: < 150 mg/dL, Borderline: 150-199]
• HDL Cholesterol: 42 mg/dL [Optimal: > 40 mg/dL]
• LDL Cholesterol: 111 mg/dL [Optimal for Diabetics: < 100 mg/dL]
`.trim();

  test('1. Document classification correctly identifies document categories', () => {
    expect(SarvamOcrService.classifyDocument(sampleLabText)).toBe('LAB_REPORT');

    const rxText = 'Rx: Tab Metformin 500mg BD, Tab Glimepiride 1mg OD. Dosage frequency: twice daily with meals.';
    expect(SarvamOcrService.classifyDocument(rxText)).toBe('PRESCRIPTION');

    const dischargeText = 'Apollo Hospital - Discharge Summary. Date of Admission: 10 Nov 2026. Hospital stay uneventful.';
    expect(SarvamOcrService.classifyDocument(dischargeText)).toBe('DISCHARGE_SUMMARY');

    const cgmText = 'Dexcom Clarity Ambulatory Glucose Profile (AGP) Report. Time In Range: 74%. Glucose Management Indicator: 6.9%.';
    expect(SarvamOcrService.classifyDocument(cgmText)).toBe('CGM_AGP_REPORT');

    const certText = 'Medical Certificate of Fitness. This is to certify that Mr. X was unfit for duty from Nov 1 to Nov 5.';
    expect(SarvamOcrService.classifyDocument(certText)).toBe('MEDICAL_CERTIFICATE');
  });

  test('2. Structured clinical lab extraction parses Glycemic Profile correctly', () => {
    const labs = SarvamOcrService.extractClinicalFields(sampleLabText, 'LAB_REPORT');

    // HbA1c
    expect(labs.hba1c).toBeDefined();
    expect(labs.hba1c?.standardizedValue).toBe(7.2);
    expect(labs.hba1c?.unit).toBe('%');
    expect(labs.hba1c?.isAbnormal).toBe(true);

    // Fasting Blood Glucose
    expect(labs.fastingBloodGlucose).toBeDefined();
    expect(labs.fastingBloodGlucose?.standardizedValue).toBe(124);
    expect(labs.fastingBloodGlucose?.unit).toBe('mg/dL');
    expect(labs.fastingBloodGlucose?.isAbnormal).toBe(true);

    // Post-Prandial Glucose
    expect(labs.postPrandialGlucose).toBeDefined();
    expect(labs.postPrandialGlucose?.standardizedValue).toBe(168);
    expect(labs.postPrandialGlucose?.unit).toBe('mg/dL');
    expect(labs.postPrandialGlucose?.isAbnormal).toBe(true);
  });

  test('3. Structured clinical lab extraction parses Renal Function Panel correctly', () => {
    const labs = SarvamOcrService.extractClinicalFields(sampleLabText, 'LAB_REPORT');

    // Serum Creatinine
    expect(labs.serumCreatinine).toBeDefined();
    expect(labs.serumCreatinine?.standardizedValue).toBe(1.1);
    expect(labs.serumCreatinine?.unit).toBe('mg/dL');
    expect(labs.serumCreatinine?.isAbnormal).toBe(false);

    // eGFR
    expect(labs.estimatedGfr).toBeDefined();
    expect(labs.estimatedGfr?.standardizedValue).toBe(82);
    expect(labs.estimatedGfr?.isAbnormal).toBe(false);

    // Microalbumin
    expect(labs.urineMicroalbumin).toBeDefined();
    expect(labs.urineMicroalbumin?.standardizedValue).toBe(28);
    expect(labs.urineMicroalbumin?.unit).toBe('mg/L');
    expect(labs.urineMicroalbumin?.isAbnormal).toBe(false);
  });

  test('4. Structured clinical lab extraction parses Lipid Profile correctly', () => {
    const labs = SarvamOcrService.extractClinicalFields(sampleLabText, 'LAB_REPORT');

    expect(labs.totalCholesterol?.standardizedValue).toBe(185);
    expect(labs.totalCholesterol?.isAbnormal).toBe(false);

    expect(labs.triglycerides?.standardizedValue).toBe(160);
    expect(labs.triglycerides?.isAbnormal).toBe(true);

    expect(labs.hdlCholesterol?.standardizedValue).toBe(42);
    expect(labs.hdlCholesterol?.isAbnormal).toBe(false);

    expect(labs.ldlCholesterol?.standardizedValue).toBe(111);
    expect(labs.ldlCholesterol?.isAbnormal).toBe(true);
  });

  test('5. Plain-language summary accurately describes clinical parameters', () => {
    const labs = SarvamOcrService.extractClinicalFields(sampleLabText, 'LAB_REPORT');
    const summary = SarvamOcrService.generatePlainSummary(labs, 'LAB_REPORT');

    expect(summary).toContain('HbA1c is 7.2 % (Elevated)');
    expect(summary).toContain('Fasting Glucose is 124 mg/dL (High)');
    expect(summary).toContain('Post-Meal Glucose is 168 mg/dL (High)');
    expect(summary).toContain('Serum Creatinine is 1.1 mg/dL (Normal)');
    expect(summary).toContain('Compare with source document before making clinical decisions');
  });

  test('6. Doctor clinical advice highlights abnormal values for physician review', () => {
    const labs = SarvamOcrService.extractClinicalFields(sampleLabText, 'LAB_REPORT');
    const advice = SarvamOcrService.generateDoctorAdvice(labs);

    expect(advice.some((a) => a.includes('HbA1c 7.2 % indicates glycemic target not met'))).toBe(true);
    expect(advice.some((a) => a.includes('Fasting glucose 124 mg/dL is above normal threshold'))).toBe(true);
    expect(advice.some((a) => a.includes('Post-prandial glucose 168 mg/dL elevated'))).toBe(true);
    expect(advice.some((a) => a.includes('Triglycerides 160 mg/dL elevated'))).toBe(true);
  });

  test('7. Local fallback extractor provides guaranteed deterministic results for non-digital buffers', () => {
    const fallbackText = SarvamOcrService.localStructuredExtraction(Buffer.from('arbitrary test binary content'), 'application/pdf');
    expect(fallbackText).toContain('LOCAL FALLBACK PARSER - OFFLINE/DEMO MODE');
    expect(fallbackText).toContain('METROPOLIS ADVANCED HEALTHCARE');
    expect(fallbackText).toContain('Glycosylated Hemoglobin (HbA1c): 7.2 %');
  });

  test('8. Digital PDF with embedded binary image NUL bytes and escaped parentheses extracts clean text without 0x00', () => {
    const zlib = require('zlib');
    const contentStream = zlib.deflateSync(
      Buffer.from(
        'BT\n(Patient Name : MR. VILAS KADAM)Tj\n(Blood Glucose Level \\(Fasting\\))Tj\n(105.6)Tj\n(mg/dl)Tj\n(Blood Glucose Level \\(Post Prandial\\))Tj\n(141.5)Tj\n(mg/dl)Tj\nET\n',
        'latin1',
      ),
    );
    const fakeJpegWithNul = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46,
      ...Buffer.from('(\x00garbage\x00)Tj\x00', 'latin1'),
    ]);
    const pdfBuffer = Buffer.concat([
      Buffer.from('%PDF-1.4\n1 0 obj\n<< /Length ' + contentStream.length + ' >>\nstream\n', 'latin1'),
      contentStream,
      Buffer.from('\nendstream\nendobj\n2 0 obj\n<< /Length ' + fakeJpegWithNul.length + ' >>\nstream\n', 'latin1'),
      fakeJpegWithNul,
      Buffer.from('\nendstream\nendobj\n%%EOF\n', 'latin1'),
    ]);

    const extracted = SarvamOcrService.localStructuredExtraction(pdfBuffer, 'application/pdf');
    expect(extracted.includes('\u0000')).toBe(false);
    expect(extracted).toContain('Blood Glucose Level (Fasting)');
    expect(extracted).toContain('105.6');
    expect(extracted).toContain('Blood Glucose Level (Post Prandial)');
    expect(extracted).toContain('141.5');

    const labs = SarvamOcrService.extractClinicalFields(extracted, 'LAB_REPORT');
    expect(labs.fastingBloodGlucose?.standardizedValue).toBe(105.6);
    expect(labs.fastingBloodGlucose?.isAbnormal).toBe(true);
    expect(labs.postPrandialGlucose?.standardizedValue).toBe(141.5);
    expect(labs.postPrandialGlucose?.isAbnormal).toBe(true);
  });

  test('9. Table-formatted Blood Glucose Level (Fasting / Post Prandial) values are parsed accurately', () => {
    const htmlExtractedText = [
      'Patient Name: MR. VILAS KADAM',
      'Blood Glucose Level(Fasting) | 105.6 | mg/dl | 70 - 110',
      'Glucose Urine | Absent',
      'Urine Ketone | Absent',
      'Blood Glucose Level(Post Prandial) | 141.5 | mg/dl | 80 - 140',
    ].join('\n');

    const labs = SarvamOcrService.extractClinicalFields(htmlExtractedText, 'LAB_REPORT');
    expect(labs.fastingBloodGlucose?.standardizedValue).toBe(105.6);
    expect(labs.postPrandialGlucose?.standardizedValue).toBe(141.5);
    expect(SarvamOcrService.formatSafeOcrError(new Error('Invalid `prisma.ocrProcessingJob.update()` invocation'))).not.toContain('prisma');
  });
});
