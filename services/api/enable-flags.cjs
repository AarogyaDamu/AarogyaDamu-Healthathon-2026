const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const flagsToEnable = [
  'P0_1_HEALTH_JOURNAL',
  'P0_2_MEDICATION_VAULT',
  'P0_3_LIFESTYLE_TWIN',
  'P0_4_NOTIFICATIONS_SOS',
  'P0_6_GROQ_DAMU_ASSISTANT',
  'P0_7_AGENTIC_EXECUTION',
];

async function main() {
  for (const id of flagsToEnable) {
    const result = await prisma.featureFlag.update({
      where: { id },
      data: { isEnabled: true },
    });
    console.log(`Enabled: ${result.id} -> isEnabled=${result.isEnabled}`);
  }
  console.log('All flags enabled successfully!');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

