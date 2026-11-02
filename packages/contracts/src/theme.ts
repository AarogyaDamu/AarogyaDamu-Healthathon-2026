/**
 * AarogyaDamu Shared Design Tokens & Clinical Thresholds
 * Used across Web and Mobile applications for unified platform consistency.
 */

export const ClinicalTokens = {
  colors: {
    primary: '#0f766e',        // Clinical Teal
    primaryDark: '#115e59',
    primaryLight: '#14b8a6',
    primarySurface: '#f0fdfa',
    primaryBorder: '#ccfbf1',

    accent: '#ea580c',         // Action Amber / Alert Orange
    accentLight: '#fff7ed',
    accentBorder: '#fed7aa',

    slate: {
      50: '#f8fafc',
      100: '#f1f5f9',
      200: '#e2e8f0',
      300: '#cbd5e1',
      400: '#94a3b8',
      500: '#64748b',
      600: '#475569',
      700: '#334155',
      800: '#1e293b',
      900: '#0f172a',
    },

    glucose: {
      hypo: '#dc2626',         // < 70 mg/dL (Low / Urgent)
      hypoBg: '#fef2f2',
      hypoBorder: '#fecaca',
      normal: '#16a34a',       // 70 - 140 mg/dL (Target)
      normalBg: '#f0fdf4',
      normalBorder: '#bbf7d0',
      elevated: '#d97706',     // 141 - 180 mg/dL (Warning)
      elevatedBg: '#fffbeb',
      elevatedBorder: '#fde68a',
      hyper: '#ea580c',        // > 180 mg/dL (High)
      hyperBg: '#fff7ed',
      hyperBorder: '#fed7aa',
      critical: '#991b1b',     // > 250 mg/dL (Severe High)
      criticalBg: '#fef2f2',
      criticalBorder: '#f87171',
    },

    status: {
      active: '#059669',
      completed: '#2563eb',
      pending: '#d97706',
      declined: '#dc2626',
      cancelled: '#64748b',
    },
  },

  thresholds: {
    glucoseFastingMin: 80,
    glucoseFastingMax: 130,
    glucosePostMealMax: 180,
    glucoseHypoUrgent: 70,
    glucoseSevereHypo: 54,
    glucoseHyperUrgent: 250,
    hba1cTarget: 7.0,
  },

  typography: {
    fontFamilySans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
} as const;

export function getGlucoseStatus(value: number, context?: string) {
  if (value < ClinicalTokens.thresholds.glucoseSevereHypo) {
    return {
      severity: 'CRITICAL_LOW',
      label: 'Severe Hypo Alert',
      color: ClinicalTokens.colors.glucose.hypo,
      bg: ClinicalTokens.colors.glucose.hypoBg,
      border: ClinicalTokens.colors.glucose.hypoBorder,
      instruction: 'Take 15-20g fast-acting sugar immediately (3-4 glucose tabs or 1/2 cup juice). Recheck in 15 mins.',
    };
  }
  if (value < ClinicalTokens.thresholds.glucoseHypoUrgent) {
    return {
      severity: 'LOW',
      label: 'Low Blood Sugar (Hypo)',
      color: ClinicalTokens.colors.glucose.hypo,
      bg: ClinicalTokens.colors.glucose.hypoBg,
      border: ClinicalTokens.colors.glucose.hypoBorder,
      instruction: 'Follow 15-15 Rule: Consume 15g carbs and recheck blood glucose in 15 minutes.',
    };
  }
  if (value > ClinicalTokens.thresholds.glucoseHyperUrgent) {
    return {
      severity: 'CRITICAL_HIGH',
      label: 'Severe Hyper Alert',
      color: ClinicalTokens.colors.glucose.critical,
      bg: ClinicalTokens.colors.glucose.criticalBg,
      border: ClinicalTokens.colors.glucose.criticalBorder,
      instruction: 'Drink abundant water. Take prescribed correction dose if advised by doctor. Contact clinician.',
    };
  }
  if (context === 'FASTING' || context === 'PRE_MEAL') {
    if (value > ClinicalTokens.thresholds.glucoseFastingMax) {
      return {
        severity: 'HIGH',
        label: 'Above Fasting Target',
        color: ClinicalTokens.colors.glucose.hyper,
        bg: ClinicalTokens.colors.glucose.hyperBg,
        border: ClinicalTokens.colors.glucose.hyperBorder,
        instruction: 'Fasting reading above 130 mg/dL. Review previous evening dinner and insulin/medication timing.',
      };
    }
  } else {
    if (value > ClinicalTokens.thresholds.glucosePostMealMax) {
      return {
        severity: 'HIGH',
        label: 'Above Post-Meal Target',
        color: ClinicalTokens.colors.glucose.hyper,
        bg: ClinicalTokens.colors.glucose.hyperBg,
        border: ClinicalTokens.colors.glucose.hyperBorder,
        instruction: 'Post-meal reading above 180 mg/dL. Consider a 15-min post-meal walk and portion control.',
      };
    }
  }
  return {
    severity: 'IN_TARGET',
    label: 'In Therapeutic Range',
    color: ClinicalTokens.colors.glucose.normal,
    bg: ClinicalTokens.colors.glucose.normalBg,
    border: ClinicalTokens.colors.glucose.normalBorder,
    instruction: 'Excellent! Your blood sugar is right within your personalized clinical target zone.',
  };
}
