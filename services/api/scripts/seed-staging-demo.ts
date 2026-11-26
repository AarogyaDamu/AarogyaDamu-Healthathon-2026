import 'dotenv/config';
import { prisma } from '../src/db/prisma';
import { ensureStagingDemoDoctor } from '../src/services/stagingDemoSeed';

async function main() {
  console.log('--- AarogyaDamu Staging Synthetic Demonstration Data Bootstrap ---');
  try {
    const rotatePasswords = process.argv.includes('--rotate-passwords') || process.env.ROTATE_DEMO_PASSWORDS === 'true';
    const result = await ensureStagingDemoDoctor(prisma, { rotatePasswords });
    console.log('[Staging Demo Seed Result]:', {
      success: result.success,
      actionTaken: result.actionTaken,
      doctorEmail: result.doctorEmail,
      isClinician: result.isClinician,
      isActive: result.isActive,
      hasPatientLink: result.hasPatientLink,
      syntheticPatients: result.syntheticPatients?.map((p) => ({
        email: p.email,
        clinicalFocus: p.clinicalFocus,
        isSyntheticDemo: p.isSyntheticDemo,
      })),
      featureFlagsSummary: result.featureFlagsSummary,
      message: result.message,
      stats: result.stats,
    });
    if (!result.success) {
      console.error('Seed operation did not succeed:', result.message);
      process.exit(1);
    }
    console.log('--- Staging Demonstration Dataset Successfully Ready ---');
  } catch (err: any) {
    console.error('Failed to bootstrap staging demo dataset:', err?.message || err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
