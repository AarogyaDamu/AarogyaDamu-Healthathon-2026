import {
  validateAppointmentTransition,
  ALLOWED_CLINICIAN_TRANSITIONS,
  ALLOWED_PATIENT_TRANSITIONS,
  AppointmentState,
} from '../services/appointmentTransitionService';

describe('Appointment State Machine Validation', () => {
  describe('Clinician Transition Matrix', () => {
    it('allows clinician to confirm requested or rescheduled appointments', () => {
      expect(validateAppointmentTransition('REQUESTED', 'CONFIRMED', true).valid).toBe(true);
      expect(validateAppointmentTransition('RESCHEDULED', 'CONFIRMED', true).valid).toBe(true);
    });

    it('allows clinician to decline requested appointments', () => {
      expect(validateAppointmentTransition('REQUESTED', 'DECLINED', true).valid).toBe(true);
    });

    it('allows clinician to complete confirmed appointments', () => {
      expect(validateAppointmentTransition('CONFIRMED', 'COMPLETED', true).valid).toBe(true);
    });

    it('allows clinician to mark confirmed appointments as missed', () => {
      expect(validateAppointmentTransition('CONFIRMED', 'MISSED', true).valid).toBe(true);
    });

    it('allows clinician to cancel requested, confirmed, or rescheduled appointments', () => {
      expect(validateAppointmentTransition('REQUESTED', 'CANCELLED', true).valid).toBe(true);
      expect(validateAppointmentTransition('CONFIRMED', 'CANCELLED', true).valid).toBe(true);
      expect(validateAppointmentTransition('RESCHEDULED', 'CANCELLED', true).valid).toBe(true);
    });

    it('strictly forbids transitions out of terminal states (COMPLETED, CANCELLED, DECLINED, MISSED)', () => {
      const terminalStates: AppointmentState[] = ['COMPLETED', 'CANCELLED', 'DECLINED', 'MISSED'];
      const targetStates: AppointmentState[] = ['REQUESTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'RESCHEDULED'];

      for (const terminal of terminalStates) {
        for (const target of targetStates) {
          const check = validateAppointmentTransition(terminal, target, true);
          expect(check.valid).toBe(false);
          expect(check.reason).toBeDefined();
        }
      }
    });
  });

  describe('Patient / Caregiver Transition Matrix', () => {
    it('allows patient to cancel active appointments', () => {
      expect(validateAppointmentTransition('REQUESTED', 'CANCELLED', false).valid).toBe(true);
      expect(validateAppointmentTransition('CONFIRMED', 'CANCELLED', false).valid).toBe(true);
      expect(validateAppointmentTransition('RESCHEDULED', 'CANCELLED', false).valid).toBe(true);
    });

    it('allows patient to reschedule active appointments', () => {
      expect(validateAppointmentTransition('REQUESTED', 'RESCHEDULED', false).valid).toBe(true);
      expect(validateAppointmentTransition('CONFIRMED', 'RESCHEDULED', false).valid).toBe(true);
    });

    it('strictly forbids patient from confirming, declining, or completing appointments', () => {
      expect(validateAppointmentTransition('REQUESTED', 'CONFIRMED', false).valid).toBe(false);
      expect(validateAppointmentTransition('REQUESTED', 'DECLINED', false).valid).toBe(false);
      expect(validateAppointmentTransition('CONFIRMED', 'COMPLETED', false).valid).toBe(false);
      expect(validateAppointmentTransition('CONFIRMED', 'MISSED', false).valid).toBe(false);
    });

    it('forbids patient actions on terminal appointments', () => {
      expect(validateAppointmentTransition('COMPLETED', 'CANCELLED', false).valid).toBe(false);
      expect(validateAppointmentTransition('CANCELLED', 'RESCHEDULED', false).valid).toBe(false);
      expect(validateAppointmentTransition('DECLINED', 'CANCELLED', false).valid).toBe(false);
    });
  });
});

