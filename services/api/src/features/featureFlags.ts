import { FeatureFlagKey, RolloutTier, FeatureFlag } from '@aarogyadamu/contracts';
import { safeClinicalLog } from '../audit/clinicalAuditLogger';
import { prisma } from '../db/prisma';

export const DEFAULT_FEATURE_FLAGS: Record<FeatureFlagKey, { isEnabled: boolean; name: string; description: string; rolloutTier: RolloutTier }> = {
  P0_0_SAFETY_FOUNDATION: {
    name: 'Clinical Safety & Data Foundation',
    description: 'ADA safety evaluation thresholds, medical audit logging, AI safety boundaries, and feature governance.',
    isEnabled: true,
    rolloutTier: 'development',
  },
  P0_1_HEALTH_JOURNAL: {
    name: 'Unified Health Journal',
    description: 'Vital signs, continuous/discrete blood glucose, blood pressure, weight, and HbA1c tracking.',
    isEnabled: true,
    rolloutTier: 'development',
  },
  P0_2_MEDICATION_VAULT: {
    name: 'Medication Vault & Adherence Management',
    description: 'Prescriptions, medication schedules, dispensing history, and adherence alerts.',
    isEnabled: true,
    rolloutTier: 'development',
  },
  P0_3_LIFESTYLE_TWIN: {
    name: 'Lifestyle Tracking & Digital Health Twin',
    description: 'Nutrition logging, physical activity, sleep monitoring, and metabolic modeling.',
    isEnabled: true,
    rolloutTier: 'development',
  },
  P0_4_NOTIFICATIONS_SOS: {
    name: 'Clinical Notifications & Emergency SOS',
    description: 'Critical hypoglycemia alerts, caregiver dispatch, and emergency contact escalations.',
    isEnabled: true,
    rolloutTier: 'development',
  },
  get P0_6_GROQ_DAMU_ASSISTANT() {
    const isProd = process.env.NODE_ENV === 'production';
    return {
      name: 'Damu Multilingual Voice Assistant',
      description: 'Conversational diabetes companion, speech recognition, and regional voice synthesis.',
      isEnabled: !isProd,
      rolloutTier: (isProd ? 'pilot_restricted' : 'development') as RolloutTier,
    };
  },
  get P0_6_GROQ_VOICE_ASSISTANT() {
    const isProd = process.env.NODE_ENV === 'production';
    return {
      name: 'Damu Multilingual Voice Assistant',
      description: 'Conversational diabetes companion, speech recognition, and regional voice synthesis.',
      isEnabled: !isProd,
      rolloutTier: (isProd ? 'pilot_restricted' : 'development') as RolloutTier,
    };
  },
  P0_7_AGENTIC_EXECUTION: {
    name: 'Governed Agentic Execution',
    description: 'Human-in-the-loop AI task planning, follow-up scheduling, and care proposal approval.',
    isEnabled: false,
    rolloutTier: 'development',
  },
  P0_8_EXTERNAL_INTEGRATIONS: {
    name: 'Wearables & WhatsApp Integrations',
    description: 'Continuous glucose monitor sync, wearable step counters, and WhatsApp health digests.',
    isEnabled: false,
    rolloutTier: 'development',
  },
};

interface CacheEntry {
  flags: Map<string, FeatureFlag>;
  cachedAt: number;
}

let flagCache: CacheEntry | null = null;
const CACHE_TTL_MS = 15000; // 15 seconds

export async function getAllFeatureFlags(): Promise<FeatureFlag[]> {
  const now = Date.now();
  if (flagCache && (now - flagCache.cachedAt) < CACHE_TTL_MS) {
    return Array.from(flagCache.flags.values());
  }

  try {
    const dbFlags = await prisma.featureFlag.findMany();
    const map = new Map<string, FeatureFlag>();

    // Seed in-memory map with defaults
    for (const [key, def] of Object.entries(DEFAULT_FEATURE_FLAGS)) {
      map.set(key, {
        id: key as FeatureFlagKey,
        name: def.name,
        description: def.description,
        isEnabled: def.isEnabled,
        rolloutTier: def.rolloutTier,
        metadata: {},
      });
    }

    // Overlay DB values
    for (const record of dbFlags) {
      let parsedMetadata: Record<string, unknown> = {};
      if (record.metadata) {
        try {
          parsedMetadata = JSON.parse(record.metadata);
        } catch {
          parsedMetadata = {};
        }
      }

      map.set(record.id, {
        id: record.id as FeatureFlagKey,
        name: record.name,
        description: record.description || undefined,
        isEnabled: record.isEnabled,
        rolloutTier: record.rolloutTier as RolloutTier,
        metadata: parsedMetadata,
        updatedAt: record.updatedAt.toISOString(),
      });
    }

    flagCache = {
      flags: map,
      cachedAt: now,
    };

    return Array.from(map.values());
  } catch (error) {
    safeClinicalLog('warn', 'Failed to read feature flags from database, returning system defaults', { error: String(error) });
    return Object.entries(DEFAULT_FEATURE_FLAGS).map(([key, def]) => ({
      id: key as FeatureFlagKey,
      name: def.name,
      description: def.description,
      isEnabled: def.isEnabled,
      rolloutTier: def.rolloutTier,
      metadata: {},
    }));
  }
}

export async function isFeatureEnabled(key: FeatureFlagKey): Promise<boolean> {
  // Allow environment variable override: FEATURE_FLAG_<KEY>=true/false
  const envKey = `FEATURE_FLAG_${key}`;
  if (process.env[envKey] !== undefined) {
    return process.env[envKey] === 'true' || process.env[envKey] === '1';
  }

  // Handle alias for P0.6 Voice Assistant
  if (key === 'P0_6_GROQ_VOICE_ASSISTANT' && process.env['FEATURE_FLAG_P0_6_GROQ_DAMU_ASSISTANT'] !== undefined) {
    return process.env['FEATURE_FLAG_P0_6_GROQ_DAMU_ASSISTANT'] === 'true' || process.env['FEATURE_FLAG_P0_6_GROQ_DAMU_ASSISTANT'] === '1';
  }
  if (key === 'P0_6_GROQ_DAMU_ASSISTANT' && process.env['FEATURE_FLAG_P0_6_GROQ_VOICE_ASSISTANT'] !== undefined) {
    return process.env['FEATURE_FLAG_P0_6_GROQ_VOICE_ASSISTANT'] === 'true' || process.env['FEATURE_FLAG_P0_6_GROQ_VOICE_ASSISTANT'] === '1';
  }

  const flags = await getAllFeatureFlags();
  const flag = flags.find((f) => f.id === key);
  if (flag) return flag.isEnabled;

  if (key === 'P0_6_GROQ_VOICE_ASSISTANT' || key === 'P0_6_GROQ_DAMU_ASSISTANT') {
    const aliasKey = key === 'P0_6_GROQ_VOICE_ASSISTANT' ? 'P0_6_GROQ_DAMU_ASSISTANT' : 'P0_6_GROQ_VOICE_ASSISTANT';
    const aliasFlag = flags.find((f) => f.id === aliasKey);
    if (aliasFlag) return aliasFlag.isEnabled;
  }

  return DEFAULT_FEATURE_FLAGS[key]?.isEnabled ?? false;
}

export async function setFeatureFlag(
  key: FeatureFlagKey,
  isEnabled: boolean,
  rolloutTier?: RolloutTier,
  metadata?: Record<string, unknown>
): Promise<FeatureFlag> {
  const def = DEFAULT_FEATURE_FLAGS[key];
  const name = def ? def.name : key;
  const description = def ? def.description : undefined;

  const updated = await prisma.featureFlag.upsert({
    where: { id: key },
    create: {
      id: key,
      name,
      description,
      isEnabled,
      rolloutTier: rolloutTier || 'development',
      metadata: metadata ? JSON.stringify(metadata) : null,
    },
    update: {
      isEnabled,
      rolloutTier: rolloutTier || undefined,
      metadata: metadata ? JSON.stringify(metadata) : undefined,
    },
  });

  // Invalidate cache
  flagCache = null;

  safeClinicalLog('info', `Feature flag updated: ${key} = ${isEnabled}`, {
    key,
    isEnabled,
    rolloutTier: updated.rolloutTier,
  });

  return {
    id: updated.id as FeatureFlagKey,
    name: updated.name,
    description: updated.description || undefined,
    isEnabled: updated.isEnabled,
    rolloutTier: updated.rolloutTier as RolloutTier,
    metadata: metadata || {},
    updatedAt: updated.updatedAt.toISOString(),
  };
}

export async function seedDefaultFeatureFlags(): Promise<void> {
  try {
    for (const [key, def] of Object.entries(DEFAULT_FEATURE_FLAGS)) {
      const existing = await prisma.featureFlag.findUnique({ where: { id: key } });
      if (!existing) {
        await prisma.featureFlag.create({
          data: {
            id: key,
            name: def.name,
            description: def.description,
            isEnabled: def.isEnabled,
            rolloutTier: def.rolloutTier,
          },
        });
      }
    }
  } catch (error) {
    safeClinicalLog('warn', 'Failed to seed default feature flags', { error: String(error) });
  }
}
