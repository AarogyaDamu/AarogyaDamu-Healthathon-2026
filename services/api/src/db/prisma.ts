import { PrismaClient } from '@prisma/client';

// One Prisma client per API process prevents each route/service module from
// opening its own PostgreSQL pool. Production pool sizing belongs in the
// DATABASE_URL connection_limit setting supplied by the deployment.
export const prisma = new PrismaClient();
