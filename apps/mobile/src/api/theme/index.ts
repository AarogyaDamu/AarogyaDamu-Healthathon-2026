export const theme = {
  colors: {
    primary: '#0f766e',
    primaryDark: '#115e59',
    primaryLight: '#14b8a6',
    primarySurface: '#f0fdfa',
    primaryBorder: '#ccfbf1',
    accent: '#ea580c',
    accentLight: '#fff7ed',
    accentBorder: '#fed7aa',
    white: '#ffffff',
    bg: '#f8fafc',
    card: '#ffffff',
    cardMuted: '#f1f5f9',
    border: '#e2e8f0',
    borderLight: '#f1f5f9',
    text: '#0f172a',
    textSecondary: '#334155',
    textMuted: '#64748b',
    textPlaceholder: '#94a3b8',
    success: '#15803d',
    successBg: '#dcfce7',
    successBorder: '#bbf7d0',
    warning: '#b45309',
    warningBg: '#fef3c7',
    warningBorder: '#fde68a',
    error: '#b91c1c',
    errorBg: '#fee2e2',
    errorBorder: '#fecdd3',
  },

  typography: {
    sizes: {
      caption: 12,
      meta: 13,
      bodySm: 14,
      body: 15,
      bodyLg: 16,
      headingSm: 22,
      heading: 24,
      headingLg: 28,
      metric: 32,
      metricLg: 44,
    },

    lineHeights: {
      caption: 16,
      meta: 18,
      bodySm: 20,
      body: 22,
      bodyLg: 24,
      headingSm: 26,
      heading: 30,
      headingLg: 34,
      metric: 40,
    },

    weights: {
      regular: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
      extrabold: '800',
      black: '900',
    },
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },

  radius: {
    xs: 8,
    sm: 12,
    md: 16,
    lg: 18,
    xl: 20,
    pill: 999,
  },

  touchTarget: {
    minHeight: 48,
    minWidth: 48,
  },

  shadows: {
    card: {
      shadowColor: '#0f172a',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 8,
      elevation: 2,
    },

    floating: {
      shadowColor: '#0f766e',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.14,
      shadowRadius: 10,
      elevation: 4,
    },
  },
} as const;

export type Theme = typeof theme;