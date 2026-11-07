const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.featureFlag.findMany().then(flags => {
  console.log(JSON.stringify(flags, null, 2));
  return prisma.$disconnect();
}).catch(e => { console.error(e); process.exit(1); });

