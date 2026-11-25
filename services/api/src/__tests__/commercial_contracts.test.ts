import {
  DoctorOnboardingSchema,
  PrescriptionItemSchema,
  ConsultationWorkspaceRecordSchema,
  PatientEncounterBillingSchema,
  EncounterBillingStatusUpdateSchema,
} from '@aarogyadamu/contracts';

describe('AarogyaDamu Commercial Contracts Suite', () => {
  describe('Doctor Onboarding & Practice Profile', () => {
    it('validates authentic clinician onboarding payload with Indian registration & phone', () => {
      const valid = {
        fullName: 'Dr. Aarav Sharma',
        registrationNumber: 'KMC-2015-84920',
        council: 'Karnataka Medical Council',
        specialty: 'Diabetology & Endocrinology',
        qualifications: 'MBBS, MD, Fellowship in Diabetes (RSSDI)',
        practiceName: 'Aarav Diabetes & Endocrine Care',
        address: '104, Indiranagar 100ft Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560038',
        phone: '9845012345',
        consultationFeeInr: 600,
        workingDays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'],
      };

      const parsed = DoctorOnboardingSchema.parse(valid);
      expect(parsed.fullName).toBe('Dr. Aarav Sharma');
      expect(parsed.consultationFeeInr).toBe(600);
      expect(parsed.postalCode).toBe('560038');
    });

    it('rejects invalid PIN code or negative consultation fee', () => {
      const invalid = {
        fullName: 'Dr. Aarav Sharma',
        registrationNumber: 'KMC-2015-84920',
        council: 'Karnataka Medical Council',
        specialty: 'Diabetology',
        practiceName: 'Clinic',
        address: 'Some road',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '5600', // Invalid 4 digits
        phone: '9845012345',
        consultationFeeInr: -50, // Negative fee
      };

      expect(() => DoctorOnboardingSchema.parse(invalid)).toThrow();
    });
  });

  describe('Consultation Workspace & Digital Rx Builder', () => {
    it('validates complete clinical SOAP consultation record with prescription', () => {
      const consultation = {
        patientId: '123e4567-e89b-12d3-a456-426614174000',
        chiefComplaint: 'Uncontrolled morning hyperglycemia and polyuria for 2 weeks',
        historyOfPresentIllness: 'Known Type 2 diabetic for 5 years, reported erratic meal timings and missed metformin doses.',
        examination: {
          bpSystolic: 130,
          bpDiastolic: 84,
          pulseRate: 76,
          weightKg: 78.5,
          randomBloodSugar: 198,
          generalExam: 'Conscious, oriented, no pallor or pedal edema.',
          systemicExam: 'Chest clear, CVS S1/S2 heard, abdomen soft non-tender.',
          footExam: 'No ulcers, peripheral pulses palpable, monofilament sensation intact bilaterally.',
        },
        diagnoses: [
          { code: 'E11.65', display: 'Type 2 diabetes mellitus with hyperglycemia', category: 'CONFIRMED' },
          { code: 'I10', display: 'Essential primary hypertension', category: 'CONFIRMED' },
        ],
        prescriptions: [
          {
            medicationName: 'Metformin Hydrochloride (Glucophage)',
            dosage: '500 mg',
            frequency: '1-0-1',
            timing: 'AFTER_FOOD',
            durationDays: 30,
            instructions: 'Take with breakfast and dinner. Do not skip meals.',
          },
          {
            medicationName: 'Glimepiride (Amaryl)',
            dosage: '1 mg',
            frequency: '1-0-0',
            timing: 'BEFORE_FOOD',
            durationDays: 30,
            instructions: 'Take 15 minutes before breakfast.',
          },
        ],
        labOrders: ['HbA1c', 'Fasting Blood Sugar', 'Serum Creatinine', 'Urine Microalbumin/Creatinine Ratio'],
        lifestyleAdvice: '30 mins brisk walking daily; reduce refined carbs, increase green leafy vegetables; monitor fasting sugars twice weekly.',
        followUpDays: 30,
        doctorConfirmed: true,
      };

      const parsed = ConsultationWorkspaceRecordSchema.parse(consultation);
      expect(parsed.diagnoses.length).toBe(2);
      expect(parsed.prescriptions.length).toBe(2);
      expect(parsed.doctorConfirmed).toBe(true);
    });

    it('validates individual prescription item schema', () => {
      const rx = {
        medicationName: 'Empagliflozin (Jardiance)',
        dosage: '10 mg',
        frequency: '1-0-0',
        timing: 'AFTER_FOOD',
        durationDays: 60,
        instructions: 'Drink plenty of water throughout the day.',
      };

      const parsed = PrescriptionItemSchema.parse(rx);
      expect(parsed.frequency).toBe('1-0-0');
      expect(parsed.timing).toBe('AFTER_FOOD');
    });
  });

  describe('Practice Billing & Collections', () => {
    it('validates encounter billing record with UPI payment', () => {
      const billing = {
        patientId: '123e4567-e89b-12d3-a456-426614174000',
        consultationFeeInr: 600,
        discountInr: 100,
        totalAmountInr: 500,
        paymentStatus: 'PAID',
        paymentMethod: 'UPI',
        transactionReference: 'UPI/2026/89402918',
        notes: 'Follow-up consultation discount applied',
      };

      const parsed = PatientEncounterBillingSchema.parse(billing);
      expect(parsed.totalAmountInr).toBe(500);
      expect(parsed.paymentStatus).toBe('PAID');
      expect(parsed.paymentMethod).toBe('UPI');
    });

    it('validates encounter billing status transition payload (PENDING -> PAID)', () => {
      const update = {
        paymentStatus: 'PAID',
        paymentMethod: 'CASH',
        transactionReference: 'CASH-REC-101',
        notes: 'Paid at front desk reception',
      };

      const parsed = EncounterBillingStatusUpdateSchema.parse(update);
      expect(parsed.paymentStatus).toBe('PAID');
      expect(parsed.paymentMethod).toBe('CASH');
      expect(parsed.transactionReference).toBe('CASH-REC-101');
    });

    it('validates voiding/cancellation of pending encounter billing', () => {
      const cancelUpdate = {
        paymentStatus: 'CANCELLED',
        notes: 'Patient rescheduled appointment before consultation',
      };

      const parsed = EncounterBillingStatusUpdateSchema.parse(cancelUpdate);
      expect(parsed.paymentStatus).toBe('CANCELLED');
    });

    it('validates refund recording for cancelled consultation', () => {
      const refundUpdate = {
        paymentStatus: 'REFUNDED',
        notes: 'Refunded via UPI due to clinician emergency leave',
      };

      const parsed = EncounterBillingStatusUpdateSchema.parse(refundUpdate);
      expect(parsed.paymentStatus).toBe('REFUNDED');
    });

    it('rejects illegal billing status values', () => {
      expect(() =>
        EncounterBillingStatusUpdateSchema.parse({ paymentStatus: 'UNPAID' }),
      ).toThrow();
      expect(() =>
        EncounterBillingStatusUpdateSchema.parse({ paymentStatus: 'COMPLETED' }),
      ).toThrow();
    });
  });
});

