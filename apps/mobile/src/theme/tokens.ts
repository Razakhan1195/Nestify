import { Platform } from "react-native";

export const colors = {
  background: "#F8F7F3",
  canvas: "#F7F6F2",
  billSurface: "#E5ECE8",
  foreground: "#202D28",
  card: "#FFFFFF",
  cardForeground: "#202D28",
  surface: "#FFFFFF",
  surfaceRaised: "#FFFFFF",
  surfaceWhite: "#FFFFFF",
  surfaceSubtle: "#E8EDE5",
  primary: "#214C3D",
  primaryForeground: "#FAF7EF",
  secondary: "#E7E8DD",
  secondaryForeground: "#264D3E",
  muted: "#EDEBE2",
  mutedForeground: "#58665F",
  accent: "#DCE4DA",
  accentForeground: "#2E3D34",
  border: "#D9DFD8",
  borderStrong: "#C9C6BA",
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
  overlay: "rgba(34, 48, 43, 0.08)",
} as const;

export const radii = {
  sm: 8,
  md: 10,
  lg: 12,
  xl: 16,
  "2xl": 20,
  "3xl": 24,
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
  "4xl": 40,
} as const;
export const layout = {
  screenHorizontal: 20,
  screenTop: 12,
  sectionGap: 28,
  touchMin: 44,
} as const;

/** Shared Home surfaces align; content can grow for long labels and large text. */
export const homeTile = { padding: 20, radius: 20, gap: 12, groupGap: 12, setupMinHeight: 168 } as const;

export const typography = {
  display: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "600" as const,
    letterSpacing: -0.8,
  },
  heading: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "600" as const,
    letterSpacing: -0.4,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "600" as const,
    letterSpacing: -0.3,
  },
  subheading: {
    fontSize: 18,
    fontWeight: "600" as const,
  },
  section: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "600" as const,
    letterSpacing: -0.2,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
  meta: {
    fontSize: 13,
    lineHeight: 18,
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
} as const;

export const shadows = {
  card: {
    shadowColor: "#17211D",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
} as const;

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


/** Editorial accents use installed system fonts; no network or font-loading gate. */
export const editorialType = {
  fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: "Georgia" }),
  fontWeight: "400" as const,
  letterSpacing: -0.8,
};
export const premium = {
  ink: "#183F33", onInk: "#FFFDF6", onInkMuted: "#D4E2D8",
  apricot: "#F2C7A5", apricotSurface: "#FAECE0", line: "#DFE3DB",
};

/** Selection controls share a quiet selected state; primary fills are for actions. */
export const selectionControl = {
  minHeight: 48, radius: 12, inset: 4, gap: 8,
  selectedBackground: colors.surfaceRaised,
  background: colors.surfaceSubtle,
  selectedText: colors.foreground,
  text: colors.mutedForeground,
} as const;
