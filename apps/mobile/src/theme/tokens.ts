import { Platform } from "react-native";

export const lightColors = {
  logoSurface: "#FFFFFF",
  artBillSurface: "#F0E4CE",
  artBillAccent: "#986C35",
  artBillPaper: "#D9B77F",
  artRecordSurface: "#DFE9EB",
  artRecordAccent: "#3D6971",
  artRecordPaper: "#A9C8CB",
  artCareSurface: "#E3EADB",
  artCareAccent: "#527044",
  artCarePaper: "#B9CD9D",
  routineWarm: "#F3E3D2",
  routineGreen: "#E4EBDD",
  chartTrack: "#E4D6BC",
  attribution: "#5E5E5E",
  exampleBillSurface: "#EFE4D0",
  exampleChartTrack: "#E0D4BD",
  exampleChartBar: "#AC9569",
  reminderSurface: "#E5EEF0",
  cleaningSurface: "#E6ECE1",
  maintenanceSurface: "#F0E8D8",
  artBacking: "#FFFFFF80",
  artPaper: "#FFFDF7",
  artBorder: "#D9DFD4",
  artAction: "#FFFDF8B8",
  artActionBorder: "#264D3E12",
  assistantLayer: "#9FB9A4",
  artRule: "#D9DFD5",
  artHalo: "#FFFFFF55",
  artAvatarGreen: "#D6E4D4",
  artAvatarSand: "#ECDDBE",
  artAvatarBlue: "#D6E4EB",
  tileBorder: "#264D3E0D",
  shortcutBill: "#F2E5CD",
  shortcutRecord: "#E0E9EC",
  chartPrevious: "#A3B8A1",
  billBorder: "#D4DFD7",
  signupBorder: "#DFE4DA",
  signupLabel: "#657568",
  signupRule: "#E8ECE5",
  signupCare: "#E7EBDB",
  signupRecords: "#E3E9EC",
  signupBills: "#F0E5D4",
  welcomeBorder: "#E1DED5",
  welcomeRule: "#E7E7E0",
  welcomeGreen: "#E2EADC",
  welcomeBlue: "#DEE8EB",
  socialInk: "#202421", socialPaper: "#FFFFFF",

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

export function severityColors(severity: SeverityLevel, colors: Colors = lightColors) {
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
export const lightPremium = {
  ink: "#183F33", brandText: "#183F33", onInk: "#FFFDF6", onInkMuted: "#D4E2D8",
  apricot: "#F2C7A5", apricotSurface: "#FAECE0", line: "#DFE3DB",
};

/** Selection controls share a quiet selected state; primary fills are for actions. */
export function makeSelectionControl(colors: Colors) { return {
  minHeight: 48, radius: 12, inset: 4, gap: 8,
  selectedBackground: colors.surfaceRaised,
  background: colors.surfaceSubtle,
  selectedText: colors.foreground,
  text: colors.mutedForeground,
} as const; }

export type Colors = { [K in keyof typeof lightColors]: string };
export const darkColors: Colors = {
  logoSurface: "#FFFFFF",
  artBillSurface: "#3C3528",
  artBillAccent: "#D9B47C",
  artBillPaper: "#88744F",
  artRecordSurface: "#293B40",
  artRecordAccent: "#99CBD0",
  artRecordPaper: "#577D82",
  artCareSurface: "#303D2C",
  artCareAccent: "#B3CE99",
  artCarePaper: "#718859",
  routineWarm: "#43382B",
  routineGreen: "#33432F",
  chartTrack: "#514735",
  attribution: "#B0BCB3",
  exampleBillSurface: "#3D3528",
  exampleChartTrack: "#574A34",
  exampleChartBar: "#B49D73",
  reminderSurface: "#293B40",
  cleaningSurface: "#2E3D31",
  maintenanceSurface: "#3B352A",
  artBacking: "#FFFFFF0D",
  artPaper: "#2A332E",
  artBorder: "#4B574D",
  artAction: "#FFFFFF0D",
  artActionBorder: "#FFFFFF1A",
  assistantLayer: "#577D63",
  artRule: "#69766B",
  artHalo: "#FFFFFF08",
  artAvatarGreen: "#364E3D",
  artAvatarSand: "#51452F",
  artAvatarBlue: "#344C57",
  tileBorder: "#FFFFFF12",
  shortcutBill: "#3D3528",
  shortcutRecord: "#293B40",
  chartPrevious: "#789C80",
  billBorder: "#42564A",
  signupBorder: "#455249",
  signupLabel: "#B0BCB3",
  signupRule: "#5E7063",
  signupCare: "#303D2C",
  signupRecords: "#293B40",
  signupBills: "#3C3528",
  welcomeBorder: "#4B574D",
  welcomeRule: "#5E7063",
  welcomeGreen: "#2E3D31",
  welcomeBlue: "#293B40",
  socialInk: "#F0F0E8", socialPaper: "#202723",

  background: "#171B19", canvas: "#141816", billSurface: "#25352E",
  foreground: "#F0F0E8", card: "#202723", cardForeground: "#F0F0E8",
  surface: "#202723", surfaceRaised: "#2A332E", surfaceWhite: "#2A332E",
  surfaceSubtle: "#29372E", primary: "#A9D4B8", primaryForeground: "#142A1F",
  secondary: "#30382F", secondaryForeground: "#D1E5D5", muted: "#2B302B",
  mutedForeground: "#B0BCB3", accent: "#34483A", accentForeground: "#DFEDDF",
  border: "#3E4B42", borderStrong: "#6F8073", destructive: "#F5AA98",
  success: "#A5D5AE", successForeground: "#B7E1BE", successBg: "#293F30",
  warning: "#E2BC7E", warningForeground: "#EAC98F", warningBg: "#403626",
  critical: "#F5AA98", criticalForeground: "#F4B6A7", criticalBg: "#472F2A",
  info: "#A4CDE5", infoForeground: "#BDDCEF", infoBg: "#293B46",
  overlay: "rgba(0,0,0,0.24)",
};
export type Premium = { [K in keyof typeof lightPremium]: string };
export const darkPremium: Premium = {
  ink: "#254A3C", brandText: "#A9D4B8", onInk: "#FFFDF6", onInkMuted: "#D4E2D8",
  apricot: "#E4B992", apricotSurface: "#43372C", line: darkColors.border,
};
// Static exports retained for non-rendering consumers; screens use useTheme().
export const colors = lightColors;
export const premium = lightPremium;
export const selectionControl = makeSelectionControl(lightColors);
