import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const flags = await prisma.featureFlag.findMany();
console.log(JSON.stringify(flags, null, 2));
await prisma.$disconnect();

