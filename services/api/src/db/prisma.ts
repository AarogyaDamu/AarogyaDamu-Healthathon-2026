import { PrismaClient } from '@prisma/client';
import { tenantContextStorage, setPostgresLocalContext } from './tenantContext';

const globalForPrisma = global as unknown as { basePrisma?: PrismaClient; prisma?: any };

// One base Prisma client per API process
export const basePrisma =
  globalForPrisma.basePrisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

// Contextually-aware Prisma client that automatically binds ambient tenant/patient
// context via transaction-local set_config(..., true) for Native PostgreSQL RLS
export const prisma =
  globalForPrisma.prisma ||
  basePrisma.$extends({
    client: {
      async $transaction(arg: any, options?: any) {
        const txOptions = { maxWait: 15000, timeout: 30000, ...options };
        if (typeof arg === 'function') {
          const ctx = tenantContextStorage.getStore();
          return basePrisma.$transaction(async (tx) => {
            if (ctx) {
              await setPostgresLocalContext(tx, ctx);
            }
            return arg(tx);
          }, txOptions);
        }
        return (basePrisma as any).$transaction(arg, txOptions);
      },
    },
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const ctx = tenantContextStorage.getStore();
          if (!ctx) {
            // Unscoped query: let PostgreSQL RLS evaluate with null context (fail-closed)
            return query(args);
          }

          // Execute inside an interactive transaction with transaction-local context
          return basePrisma.$transaction(async (tx) => {
            await setPostgresLocalContext(tx, ctx);
            const modelKey = model.charAt(0).toLowerCase() + model.slice(1);
            return (tx as any)[modelKey][operation](args);
          }, { maxWait: 15000, timeout: 30000 });
        },
      },
    },
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.basePrisma = basePrisma;
  globalForPrisma.prisma = prisma;
}
