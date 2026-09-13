/**
 * Native color tokens translated from Rezlee's web design system
 * (src/app/globals.css). Values are hex approximations of the same OKLCH
 * colors, since React Native's StyleSheet does not support oklch().
 * Keep this palette-neutral and quiet, matching the web app's sage/cream
 * theme - never introduce a new brand color here.
 */
export const colors = {
  background: "#F7F4EC",
  foreground: "#22302B",
  card: "#FCFAF3",
  cardForeground: "#22302B",
  primary: "#37493E",
  primaryForeground: "#FAF7EF",
  secondary: "#E7E8DD",
  secondaryForeground: "#37493E",
  muted: "#EDEBE2",
  mutedForeground: "#6B7871",
  accent: "#DCE4DA",
  accentForeground: "#2E3D34",
  border: "#D8D5CA",
  destructive: "#B84A3A",
  success: "#3C6B4E",
  successForeground: "#2F5A40",
  successBg: "#DCE9DE",
  warning: "#A97C3B",
  warningForeground: "#7A5825",
  warningBg: "#F1E3C7",
  critical: "#B84A3A",
  criticalForeground: "#8F3A2C",
  criticalBg: "#F3DCD5",
  info: "#3E6D8D",
  infoForeground: "#305670",
  infoBg: "#D9E6ED",
} as const;

export const radii = {
  sm: 8,
  md: 10,
  lg: 12,
  xl: 16,
  "2xl": 20,
  full: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
} as const;

export const typography = {
  heading: {
    fontSize: 28,
    fontWeight: "600" as const,
    letterSpacing: -0.4,
  },
  subheading: {
    fontSize: 18,
    fontWeight: "600" as const,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
  caption: {
    fontSize: 12,
    letterSpacing: 0.2,
  },
  label: {
    fontSize: 11,
    fontWeight: "600" as const,
    letterSpacing: 0.6,
    textTransform: "uppercase" as const,
  },
};

export type SeverityLevel = "high" | "medium" | "low";

export function severityColors(severity: SeverityLevel) {
  if (severity === "high") {
    return { fg: colors.criticalForeground, bg: colors.criticalBg };
  }
  if (severity === "medium") {
    return { fg: colors.warningForeground, bg: colors.warningBg };
  }
  return { fg: colors.infoForeground, bg: colors.infoBg };
}
