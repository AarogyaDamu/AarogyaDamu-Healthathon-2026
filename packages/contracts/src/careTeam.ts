import { z } from 'zod';

// ==========================================
// MULTIDISCIPLINARY CARE TEAM CONTRACTS
// ==========================================

export const CareTeamRoleEnum = z.enum([
  'DOCTOR',
  'NURSE',
  'DIABETES_EDUCATOR',
  'CARE_COORDINATOR',
  'PATIENT',
  'CAREGIVER',
]);
export type CareTeamRole = z.infer<typeof CareTeamRoleEnum>;

export const CareTeamMemberStatusEnum = z.enum([
  'ACTIVE',
  'INACTIVE',
  'INVITED',
]);
export type CareTeamMemberStatus = z.infer<typeof CareTeamMemberStatusEnum>;

export const CareTeamMemberSchema = z.object({
  id: z.string().uuid(),
  patientId: z.string().uuid(),
  userId: z.string().uuid(),
  role: CareTeamRoleEnum,
  fullName: z.string(),
  email: z.string().email(),
  practiceId: z.string().uuid().nullable().optional(),
  assignedByDoctorName: z.string().nullable().optional(),
  status: CareTeamMemberStatusEnum,
  createdAt: z.string().datetime(),
});
export type CareTeamMember = z.infer<typeof CareTeamMemberSchema>;

export const AddCareTeamMemberInputSchema = z.object({
  userId: z.string().uuid().optional(),
  email: z.string().email().optional(),
  role: z.enum(['NURSE', 'DIABETES_EDUCATOR', 'CARE_COORDINATOR', 'DOCTOR']),
  notes: z.string().trim().max(500).optional(),
});
export type AddCareTeamMemberInput = z.infer<typeof AddCareTeamMemberInputSchema>;

