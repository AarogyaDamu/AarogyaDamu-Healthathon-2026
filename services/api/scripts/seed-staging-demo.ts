import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { ensureStagingDemoDoctor } from '../src/services/stagingDemoSeed';

const prisma = new PrismaClient();

async function main() {
  console.log('--- AarogyaDamu Staging Synthetic Demo Doctor Bootstrap ---');
  try {
    const result = await ensureStagingDemoDoctor(prisma);
    console.log('[Staging Demo Seed Result]:', {
      success: result.success,
      actionTaken: result.actionTaken,
      doctorEmail: result.doctorEmail,
      isClinician: result.isClinician,
      isActive: result.isActive,
      hasPatientLink: result.hasPatientLink,
      message: result.message,
    });
    if (!result.success) {
      console.error('Seed operation did not succeed:', result.message);
      process.exit(1);
    }
    console.log('--- Staging Doctor Account Successfully Ready ---');
  } catch (err: any) {
    console.error('Failed to bootstrap staging demo doctor:', err?.message || err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

