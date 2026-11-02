/**
 * Local Development Doctor Provisioning Script
 *
 * PROHIBITED IN PRODUCTION: Checks NODE_ENV !== 'production'.
 * Provisions a local developer doctor account using the standard,
 * audited Doctor Invitation workflow.
 */

import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { env } from '../src/config/env';
import { createDoctorInvitation, verifyDoctorInvitation } from '../src/services/doctorInvitations';
import { hashToken, createAuthSession } from '../src/services/authSessions';

const prisma = new PrismaClient();

async function main() {
  if (env.NODE_ENV === 'production') {
    console.error('FATAL: Provisioning development doctor accounts is strictly prohibited in production environments.');
    process.exit(1);
  }

  const doctorEmail = process.env.LOCAL_DOCTOR_EMAIL || 'dr.local.dev@aarogyadamu.local';
  const doctorFullName = process.env.LOCAL_DOCTOR_NAME || 'Dr. Local Dev (Endocrinology)';
  const doctorPassword = process.env.LOCAL_DOCTOR_PASSWORD || 'LocalDoctor123!Secure';

  console.log('--- AarogyaDamu Local Doctor Account Provisioning ---');
  console.log(`Target Email: ${doctorEmail}`);

  // Check if doctor account already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: doctorEmail },
    include: { profile: true },
  });

  if (existingUser) {
    if (!existingUser.isClinician) {
      console.error(`User ${doctorEmail} exists but isClinician is false. Aborting.`);
      process.exit(1);
    }
    console.log(`Doctor account already exists for ${doctorEmail}. Updating password for local access.`);
    const passwordHash = await bcrypt.hash(doctorPassword, 10);
    await prisma.user.update({
      where: { id: existingUser.id },
      data: { passwordHash, isClinician: true },
    });
  } else {
    // 1. Issue an official Doctor Invitation
    const invitationId = randomBytes(16).toString('hex');
    const invitation = createDoctorInvitation(doctorEmail, invitationId);
    const tokenHash = hashToken(invitation.token);

    await prisma.doctorInvitation.create({
      data: {
        id: invitationId,
        email: doctorEmail,
        tokenHash,
        expiresAt: new Date(invitation.expiresAt),
      },
    });
    console.log('Step 1: Doctor Invitation created and persisted to database.');

    // 2. Verify invitation token cryptographic validity
    const verified = verifyDoctorInvitation(invitation.token, doctorEmail);
    if (!verified) {
      throw new Error('Invitation cryptographic signature verification failed.');
    }
    console.log('Step 2: Doctor Invitation signature cryptographically verified.');

    // 3. Register doctor account using the invitation
    const passwordHash = await bcrypt.hash(doctorPassword, 10);
    const user = await prisma.user.create({
      data: {
        email: doctorEmail,
        passwordHash,
        isSyntheticDemo: false,
        isClinician: true,
        profile: {
          create: {
            fullName: doctorFullName,
            diabetesType: 'UNKNOWN',
            primaryClinician: 'Local AarogyaDamu Clinical Center',
          },
        },
      },
      include: { profile: true },
    });

    // 4. Mark invitation as used
    await prisma.doctorInvitation.update({
      where: { id: invitationId },
      data: { usedAt: new Date() },
    });
    console.log('Step 3: Doctor account registered with isClinician=true and invitation redeemed.');
  }

  // 5. Assign existing demo patient to this doctor for clinical workstation preview
  const demoPatient = await prisma.user.findFirst({
    where: { email: 'demo.patient1@aarogyadamu.local' },
  });
  const doctorUser = await prisma.user.findUnique({ where: { email: doctorEmail } });

  if (demoPatient && doctorUser) {
    const existingAssignment = await prisma.doctorPatientAssignment.findFirst({
      where: { doctorId: doctorUser.id, patientId: demoPatient.id },
    });
    if (!existingAssignment) {
      await prisma.doctorPatientAssignment.create({
        data: {
          doctorId: doctorUser.id,
          patientId: demoPatient.id,
          status: 'ACTIVE',
        },
      });
      console.log('Step 4: Assigned demo patient roster record to doctor.');
    }
  }

  // 6. Verify authentication via createAuthSession & login simulation
  const verifiedUser = await prisma.user.findUnique({
    where: { email: doctorEmail },
    include: { profile: true },
  });
  if (!verifiedUser || !verifiedUser.isClinician) {
    throw new Error('Verification failed: User is not marked as clinician.');
  }

  const isPasswordValid = await bcrypt.compare(doctorPassword, verifiedUser.passwordHash);
  if (!isPasswordValid) {
    throw new Error('Verification failed: Password validation failed.');
  }

  const session = await createAuthSession(prisma, verifiedUser);
  if (!session.token || !session.refreshToken) {
    throw new Error('Verification failed: Session tokens were not created.');
  }

  console.log('\n======================================================');
  console.log(' LOCAL DOCTOR ACCOUNT READY FOR TESTING');
  console.log('======================================================');
  console.log(`Email:      ${doctorEmail}`);
  console.log(`Password:   ${doctorPassword}`);
  console.log(`Role:       Doctor / Clinician (isClinician=true)`);
  console.log(`Workstation: DoctorWorkstation (Web Application)`);
  console.log('======================================================\n');
}

main()
  .catch((e) => {
    console.error('Failed to provision local doctor:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
