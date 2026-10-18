import type {TextStyle} from 'react-native';

/**
 * Marka's design tokens: the web dashboard's light theme, adapted for phones
 * (docs/redesign/MARKA_MOBILE_REDESIGN_SPEC.md). Screens take every color,
 * size and spacing value from here instead of hard-coding them. The app is
 * light-only; there is no dark palette.
 */

const colors = {
  bg: '#f1f5f9',
  surface: '#ffffff',
  surfaceMuted: '#f8fafc',
  surfaceSunken: '#f1f5f9',
  border: '#e2e8f0',
  borderStrong: '#cbd5e1',
  text: '#0f172a',
  textSecondary: '#334155',
  muted: '#5b6b80',
  faint: '#94a3b8',
  placeholder: '#64748b',
  // Accents only (active-tab bar, card strip, selected-row strip). Never put text on it.
  brand: '#83e841',
  primary: '#2f7d16',
  primaryPressed: '#276912',
  primarySoft: '#f3fee8',
  primaryBorder: '#c9f7a8',
  onPrimary: '#ffffff',
  danger: '#dc2626',
  dangerPressed: '#b91c1c',
  // The Marka mark only (MarkaMark.tsx keeps its own copy of this value).
  logo: '#00B316',
  backdrop: 'rgba(15, 23, 42, 0.5)',
  shadow: '#000000',
  // The photo previews' letterbox behind a scanned page.
  imageBackdrop: '#e2e8f0',
} as const;

export interface StatusColors {
  soft: string;
  bg: string;
  border: string;
  text: string;
}

const status = {
  success: {soft: '#f0fdf4', bg: '#dcfce7', border: '#bbf7d0', text: '#2f7d16'},
  warning: {soft: '#fffbeb', bg: '#ffedd5', border: '#fed7aa', text: '#c2410c'},
  danger: {soft: '#fef2f2', bg: '#fee2e2', border: '#fecaca', text: '#b91c1c'},
  info: {soft: '#eff6ff', bg: '#dbeafe', border: '#bfdbfe', text: '#1d4ed8'},
  neutral: {soft: '#f8fafc', bg: '#f1f5f9', border: '#e2e8f0', text: '#475569'},
  saved: {soft: '#f0fdfa', bg: '#ccfbf1', border: '#99f6e4', text: '#0f766e'},
} as const satisfies Record<string, StatusColors>;

export type StatusTone = keyof typeof status;

const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

const radius = {
  control: 8,
  card: 8,
  dialog: 12,
  pill: 999,
} as const;

// System Roboto: no fontFamily. Nothing heavier than 700, nothing below 12.
const type = {
  display: {fontSize: 24, lineHeight: 30, fontWeight: '700'},
  title: {fontSize: 20, lineHeight: 26, fontWeight: '600'},
  dialogTitle: {fontSize: 18, lineHeight: 24, fontWeight: '600'},
  cardTitle: {fontSize: 16, lineHeight: 22, fontWeight: '600'},
  body: {fontSize: 14, lineHeight: 20, fontWeight: '400'},
  bodyStrong: {fontSize: 14, lineHeight: 20, fontWeight: '500'},
  button: {fontSize: 14, lineHeight: 20, fontWeight: '600'},
  label: {fontSize: 12, lineHeight: 16, fontWeight: '500'},
  caption: {fontSize: 12, lineHeight: 16, fontWeight: '400'},
  score: {fontSize: 22, lineHeight: 28, fontWeight: '700'},
  avatar: {fontSize: 20, lineHeight: 26, fontWeight: '600'},
} as const satisfies Record<string, TextStyle>;

const elevation = {
  card: 0,
  toast: 6,
  stickyFooter: 8,
  dialog: 12,
} as const;

export const theme = {
  colors,
  status,
  spacing,
  radius,
  type,
  elevation,
  // Minimum size of anything pressable, in dp.
  touchTarget: 48,
  screenPadding: 16,
  iconSize: {small: 18, regular: 22},
} as const;

export type Theme = typeof theme;
