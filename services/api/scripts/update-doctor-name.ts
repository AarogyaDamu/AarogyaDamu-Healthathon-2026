import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      isClinician: true,
      profile: {
        select: {
          fullName: true,
          primaryClinician: true,
        },
      },
    },
  });
  console.log('Current users:', JSON.stringify(users, null, 2));

  // Update dr.kulkarni to dr.rc and Dr. Anjali Kulkarni to Dr. Rupam Choudhary (Diabetologist)
  const updatedUser = await prisma.user.updateMany({
    where: {
      email: 'dr.kulkarni@aarogyadamu.local',
    },
    data: {
      email: 'dr.rc@aarogyadamu.local',
    },
  });
  console.log('Updated user records:', updatedUser);

  const updatedProfiles = await prisma.patientProfile.updateMany({
    where: {
      fullName: {
        contains: 'Anjali Kulkarni',
      },
    },
    data: {
      fullName: 'Dr. Rupam Choudhary (Diabetologist)',
    },
  });
  console.log('Updated profile records:', updatedProfiles);

  const updatedPrimary = await prisma.patientProfile.updateMany({
    where: {
      primaryClinician: {
        contains: 'Anjali Kulkarni',
      },
    },
    data: {
      primaryClinician: 'Dr. Rupam Choudhary (Diabetologist)',
    },
  });
  console.log('Updated primaryClinician in profiles:', updatedPrimary);

  // Also update any consultation preps or notes with Dr. Anjali Kulkarni
  const prep = await prisma.consultationPrep.updateMany({
    where: {
      clinicianName: {
        contains: 'Anjali Kulkarni',
      },
    },
    data: {
      clinicianName: 'Dr. Rupam Choudhary (Diabetologist)',
    },
  });
  console.log('Updated consultation preps:', prep);

  const notes = await prisma.consultationNote.updateMany({
    where: {
      clinicianName: {
        contains: 'Anjali Kulkarni',
      },
    },
    data: {
      clinicianName: 'Dr. Rupam Choudhary (Diabetologist)',
    },
  });
  console.log('Updated consultation notes:', notes);
  const checkUsers = await prisma.user.findMany({
    where: {
      OR: [
        { email: { contains: 'kulkarni' } },
        { email: { contains: 'anjali' } },
      ],
    },
  });
  const checkProfiles = await prisma.patientProfile.findMany({
    where: {
      OR: [
        { fullName: { contains: 'kulkarni' } },
        { fullName: { contains: 'anjali' } },
        { primaryClinician: { contains: 'kulkarni' } },
        { primaryClinician: { contains: 'anjali' } },
      ],
    },
  });
  const checkNotes = await prisma.consultationNote.findMany({
    where: {
      OR: [
        { clinicianName: { contains: 'kulkarni' } },
        { clinicianName: { contains: 'anjali' } },
      ],
    },
  });
  const checkPreps = await prisma.consultationPrep.findMany({
    where: {
      OR: [
        { clinicianName: { contains: 'kulkarni' } },
        { clinicianName: { contains: 'anjali' } },
      ],
    },
  });

  console.log('Verification check for kulkarni/anjali remaining in database:');
  console.log({
    matchingUsers: checkUsers.length,
    matchingProfiles: checkProfiles.length,
    matchingNotes: checkNotes.length,
    matchingPreps: checkPreps.length,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
