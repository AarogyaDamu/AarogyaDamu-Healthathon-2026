/**
 * AAROGYADAMU MOBILE APPLICATION — OFFICIAL BRAND SYSTEM
 * Palette 1: Deep Teal (#004D4D), Secondary Teal (#0E7C7B), Mint (#A7E6C3), Light Mint (#E6F8EF)
 * Mascot Warm Orange (#c95410) strictly preserved
 */

export const theme = {
  colors: {
    // Primary: AarogyaDamu Deep Teal (Palette 1)
    primary: '#004D4D',
    primaryDark: '#003333',
    primaryLight: '#0E7C7B',
    primarySurface: '#E6F8EF',
    primaryBorder: 'rgba(0, 77, 77, 0.15)',
    primaryFixed: '#E6F8EF',
    primaryFixedDim: '#A7E6C3',
    onPrimary: '#ffffff',
    onPrimaryContainer: '#004D4D',

    // Mascot Warm Orange & Companion Cream (MANDATORY PRESERVATION - UNTOUCHED)
    accent: '#c95410',
    accentLight: '#fff0d8',
    accentBorder: '#fed7aa',
    mascotCream: '#fff0d8',
    mascotOrange: '#c95410',

    // Secondary & Tertiary: Secondary Teal & Mint
    secondary: '#0E7C7B',
    secondaryLight: '#E6F8EF',
    secondaryContainer: '#A7E6C3',
    onSecondary: '#ffffff',

    tertiary: '#0E7C7B',
    archivalGold: '#0E7C7B',
    tertiaryLight: '#E6F8EF',
    tertiaryBorder: '#A7E6C3',
    tertiaryContainer: '#E6F8EF',
    onTertiary: '#ffffff',
    onTertiaryContainer: '#004D4D',

    // AarogyaDamu Official Developer Tokens
    brandDeepTeal: '#004D4D',
    brandTeal: '#0E7C7B',
    brandMint: '#A7E6C3',
    brandLightMint: '#E6F8EF',
    brandWhite: '#FFFFFF',

    // Alexandria Surface Hierarchy (The No-Line Rule)
    white: '#ffffff',
    bg: '#f8f9fc',
    background: '#f8f9fc',
    neutralSurface: '#f2f4f8',
    elevatedSurface: '#e9ecf2',
    card: '#ffffff', // surface-container-lowest
    surfaceContainerLowest: '#ffffff',
    cardMuted: '#f2f3f9', // surface-container-low
    surfaceContainerLow: '#f2f3f9',
    cardNeutral: '#eceef3', // surface-container
    surfaceContainer: '#eceef3',
    cardHigh: '#e6e8ed', // surface-container-high
    surfaceContainerHigh: '#e6e8ed',
    cardHighest: '#e1e2e8', // surface-container-highest
    surfaceContainerHighest: '#e1e2e8',
    surfaceDim: '#d8dadf',

    // Ghost Borders
    border: 'rgba(0, 77, 77, 0.08)',
    borderLight: 'rgba(0, 77, 77, 0.04)',
    borderGhost: 'rgba(0, 77, 77, 0.06)',
    outline: '#737784',
    outlineVariant: '#c3c6d5',

    // Typography & Content Luminance
    text: '#191c20', // on-surface
    textSecondary: '#434653', // on-surface-variant
    textMuted: '#737784', // outline
    textPlaceholder: '#94a3b8',
    onSurface: '#191c20',
    onSurfaceVariant: '#434653',
    surface: '#f8f9fc',
    surfaceVariant: '#e1e2ec',

    // Clinical Semantics (STRICTLY PRESERVED)
    success: '#15803d',
    successBg: '#e6f7ed',
    successBorder: '#bbf7d0',

    warning: '#b45309',
    warningBg: '#fef3c7',
    warningBorder: '#fde68a',

    error: '#ba1a1a',
    errorBg: '#ffdad6',
    errorBorder: '#ffb4ab',
  },

  typography: {
    sizes: {
      caption: 11,
      meta: 12,
      bodySm: 13,
      body: 14,
      bodyLg: 16,
      headingSm: 18,
      heading: 22,
      headingLg: 26,
      metric: 32,
      metricLg: 44,
    },

    lineHeights: {
      caption: 15,
      meta: 16,
      bodySm: 18,
      body: 20,
      bodyLg: 24,
      headingSm: 24,
      heading: 28,
      headingLg: 34,
      metric: 38,
      metricLg: 50,
    },

    weights: {
      regular: '400' as const,
      medium: '500' as const,
      semibold: '600' as const,
      bold: '700' as const,
      extrabold: '800' as const,
      black: '900' as const,
    },

    fontFamilies: {
      headline: 'Inter',
      body: 'Inter',
      label: 'Inter',
    },

    fonts: {
      serif: 'Noto Serif',
      sans: 'Inter',
      label: 'Public Sans',
    },
  },

  fonts: {
    serif: 'Noto Serif',
    sans: 'Inter',
    label: 'Public Sans',
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
    lg: 20,
    xl: 24,
    pill: 999,
    full: 9999,
  },

  borders: {
    ghost: 'rgba(9, 76, 178, 0.08)',
    light: 'rgba(9, 76, 178, 0.04)',
    subtle: 'rgba(9, 76, 178, 0.06)',
    radius: {
      xs: 8,
      sm: 12,
      md: 16,
      lg: 20,
      xl: 24,
      pill: 999,
      full: 9999,
    },
  },

  touchTarget: {
    minHeight: 48,
    minWidth: 48,
  },

  shadows: {
    card: {
      shadowColor: '#004D4D',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.05,
      shadowRadius: 12,
      elevation: 2,
    },

    elevation2: {
      shadowColor: '#004D4D',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 14,
      elevation: 3,
    },

    soft: {
      shadowColor: '#191c20',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 8,
      elevation: 1,
    },

    floating: {
      shadowColor: '#004D4D',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12,
      shadowRadius: 18,
      elevation: 5,
    },

    subtle: {
      shadowColor: '#191c20',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.03,
      shadowRadius: 6,
      elevation: 1,
    },
  },
} as const;

export type Theme = typeof theme;
