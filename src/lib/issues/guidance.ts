export const issueCategories = [
  { label: "Plumbing", value: "plumbing" },
  { label: "Electrical", value: "electrical" },
  { label: "Heating / cooling", value: "heating_cooling" },
  { label: "Appliance", value: "appliance" },
  { label: "Internet", value: "internet" },
  { label: "Pest", value: "pest" },
  { label: "Leak / water damage", value: "leak_water_damage" },
  { label: "Noise", value: "noise" },
  { label: "Safety", value: "safety" },
  { label: "Cleaning", value: "cleaning" },
  { label: "General repair", value: "general_repair" },
  { label: "Other", value: "other" },
] as const;

export const issueLocations = [
  "kitchen",
  "bathroom",
  "bedroom",
  "living room",
  "basement",
  "laundry",
  "exterior",
  "garage",
  "whole place",
  "other",
] as const;

export const issueUrgencies = [
  { description: "Can wait.", label: "Low", value: "low" },
  { description: "Should handle soon.", label: "Medium", value: "medium" },
  { description: "Needs attention today.", label: "High", value: "high" },
  {
    description:
      "Safety, active leak, no heat, electrical concern, or serious issue.",
    label: "Urgent",
    value: "urgent",
  },
] as const;

export type IssueCategory = (typeof issueCategories)[number]["value"];
export type IssueUrgency = (typeof issueUrgencies)[number]["value"];

export type IssueGuidance = {
  escalation: string;
  likelyCauses: string[];
  recommendedSteps: string[];
  safetyNotes: string[];
};

const defaultGuidance: IssueGuidance = {
  likelyCauses: [
    "Normal wear or a small part that needs attention",
    "A setup, connection, or maintenance issue",
    "Something that may need follow-up if it keeps happening",
  ],
  recommendedSteps: [
    "Write down when it started and what changed recently.",
    "Avoid taking anything apart if you are not sure it is safe.",
    "Create a follow-up task so the issue does not get forgotten.",
  ],
  safetyNotes: [
    "Do not attempt work involving gas, live electrical, structure, or unsafe conditions.",
  ],
  escalation:
    "If the issue feels unsafe, keeps returning, or is outside basic troubleshooting, contact a landlord, property manager, or qualified professional.",
};

const guidanceByCategory: Partial<Record<IssueCategory, IssueGuidance>> = {
  appliance: {
    likelyCauses: [
      "Power, water, or vent connection issue",
      "Filter, hose, or simple maintenance need",
      "Part wear or a model-specific issue",
    ],
    recommendedSteps: [
      "Note the brand and model if accessible.",
      "Check simple power or water connections only if it is safe.",
      "Save the manual, receipt, or warranty in Vault if you have it.",
    ],
    safetyNotes: [
      "Unplug or stop using the appliance if you notice burning smells, sparks, leaking, or overheating.",
    ],
    escalation:
      "Contact a landlord, property manager, warranty provider, or qualified repair professional if it keeps happening or appears unsafe.",
  },
  electrical: {
    likelyCauses: [
      "Overloaded outlet or circuit",
      "Faulty device or fixture",
      "Wiring or breaker issue that needs a qualified professional",
    ],
    recommendedSteps: [
      "Stop using the affected outlet, switch, or device.",
      "Do not open panels or attempt live electrical work.",
      "Write down whether there was a burning smell, sparking, heat, or repeated breaker trips.",
    ],
    safetyNotes: [
      "Sparks, burning smells, heat, smoke, or repeated breaker trips may need urgent attention.",
      "Do not touch wiring or wet electrical areas.",
    ],
    escalation:
      "Contact a landlord, property manager, or licensed electrician for sparking, burning smells, repeated trips, or anything unsafe.",
  },
  heating_cooling: {
    likelyCauses: [
      "Thermostat setting or schedule issue",
      "Filter or airflow restriction",
      "System service need or equipment fault",
    ],
    recommendedSteps: [
      "Check thermostat settings and whether the issue affects the whole place.",
      "Check the filter only if it is accessible and safe.",
      "Note unusual sounds, smells, or whether heat/cooling stopped completely.",
    ],
    safetyNotes: [
      "No heat in severe cold, gas smell, burning smell, or unsafe system sounds may need urgent attention.",
    ],
    escalation:
      "Contact a landlord, property manager, or qualified HVAC professional if there is no heat in cold weather or the system seems unsafe.",
  },
  internet: {
    likelyCauses: [
      "Provider outage",
      "Modem/router needing restart",
      "Loose cable, Wi-Fi coverage, or account issue",
    ],
    recommendedSteps: [
      "Check whether the provider has an outage notice.",
      "Restart the modem/router if you are comfortable doing so.",
      "Save the provider contact or account details so follow-up is easier.",
    ],
    safetyNotes: [
      "Avoid moving wiring or wall jacks if you are unsure what they connect to.",
    ],
    escalation:
      "Contact the provider if the issue affects the whole place, repeats often, or basic restart steps do not help.",
  },
  leak_water_damage: {
    likelyCauses: [
      "Leaking fixture, appliance, pipe, roof, or exterior entry point",
      "Condensation or drainage issue",
      "Water damage that may need professional review",
    ],
    recommendedSteps: [
      "Stop using nearby water if possible and safe.",
      "Move belongings away from the area.",
      "Document what you see and when it started.",
      "Contact a landlord, property manager, or professional promptly.",
    ],
    safetyNotes: [
      "Do not touch electrical outlets, wiring, or devices near water.",
      "Active leaks, flooding, sagging surfaces, or water near electrical should be treated as urgent.",
    ],
    escalation:
      "This may need urgent attention. Contact a landlord, property manager, or qualified professional if water is active, spreading, or near electrical.",
  },
  pest: {
    likelyCauses: [
      "Food, trash, or moisture source",
      "Entry point around doors, windows, vents, or gaps",
      "Building-wide or recurring pest activity",
    ],
    recommendedSteps: [
      "Document sightings, timing, and location.",
      "Seal obvious food/trash sources.",
      "If you rent, notify your landlord or property manager.",
    ],
    safetyNotes: [
      "Use caution with sprays, traps, or chemicals around children, pets, food, and ventilation.",
    ],
    escalation:
      "Escalate if sightings continue, pests are widespread, or the issue may involve a building-level source.",
  },
  plumbing: {
    likelyCauses: [
      "Clog near the drain",
      "Blocked trap",
      "Buildup in the fixture or line",
    ],
    recommendedSteps: [
      "Avoid using harsh chemicals if you are unsure.",
      "Try basic cleaning or a plunger only if you are comfortable.",
      "Check whether multiple drains are affected.",
    ],
    safetyNotes: [
      "Stop using the fixture if water backs up, leaks, or spreads.",
    ],
    escalation:
      "Call a landlord, property manager, or plumber if multiple drains back up, water leaks, or the issue keeps returning.",
  },
  safety: {
    likelyCauses: [
      "Condition that may affect health or safety",
      "Alarm, smoke, carbon monoxide, gas, structural, or electrical concern",
      "Issue that needs immediate human judgment",
    ],
    recommendedSteps: [
      "Move away from the affected area if it feels unsafe.",
      "Document the issue only if it is safe to do so.",
      "Contact emergency services or the appropriate professional if there is immediate danger.",
    ],
    safetyNotes: [
      "Do not stay in an area with smoke, gas smell, carbon monoxide concern, active fire, or structural danger.",
    ],
    escalation:
      "If there is immediate danger, leave the area and contact emergency services or the appropriate professional.",
  },
};

export function categoryLabel(category: string | null | undefined) {
  return (
    issueCategories.find((item) => item.value === category)?.label ??
    category?.replaceAll("_", " ") ??
    "Issue"
  );
}

export function urgencyLabel(urgency: string | null | undefined) {
  if (urgency === "soon") return "Medium";
  if (urgency === "monitor") return "Low";
  return (
    issueUrgencies.find((item) => item.value === urgency)?.label ??
    urgency?.replaceAll("_", " ") ??
    "Medium"
  );
}

export function isUrgentIssue(input: {
  category?: string | null;
  description?: string | null;
  title?: string | null;
  urgency?: string | null;
}) {
  const text = `${input.title ?? ""} ${input.description ?? ""}`.toLowerCase();
  return (
    input.urgency === "urgent" ||
    input.urgency === "high" ||
    input.category === "leak_water_damage" ||
    input.category === "electrical" ||
    input.category === "safety" ||
    text.includes("gas smell") ||
    text.includes("sparks") ||
    text.includes("burning smell") ||
    text.includes("flood") ||
    text.includes("carbon monoxide") ||
    text.includes("smoke alarm") ||
    text.includes("no heat")
  );
}

export function getIssueGuidance(input: {
  category?: string | null;
  description?: string | null;
  renterOwnerContext?: string | null;
  title?: string | null;
  urgency?: string | null;
}): IssueGuidance {
  const category = input.category as IssueCategory | undefined;
  const base = guidanceByCategory[category ?? "other"] ?? defaultGuidance;
  const renterOwnerContext = input.renterOwnerContext ?? "both";
  const urgent = isUrgentIssue(input);

  const contextNote =
    renterOwnerContext === "renter"
      ? "If you rent, consider contacting your landlord or property manager and saving the issue here for follow-up."
      : renterOwnerContext === "owner"
        ? "If you own the place, consider contacting a qualified professional if the issue is urgent or outside basic troubleshooting."
        : "If you rent, contact your landlord or property manager when appropriate. If you own, contact a qualified professional when the issue is urgent or outside basic troubleshooting.";

  return {
    likelyCauses: base.likelyCauses,
    recommendedSteps: base.recommendedSteps,
    safetyNotes: urgent
      ? [
          "This may need urgent attention. If there is immediate danger, leave the area and contact emergency services or the appropriate professional.",
          ...base.safetyNotes,
          contextNote,
        ]
      : [...base.safetyNotes, contextNote],
    escalation: urgent
      ? "This may need urgent attention. If there is immediate danger, leave the area and contact emergency services or the appropriate professional."
      : base.escalation,
  };
}

export function suggestedDueDateForIssue(urgency: string | null | undefined) {
  if (urgency !== "urgent" && urgency !== "high" && urgency !== "medium") {
    return null;
  }

  const date = new Date();
  if (urgency === "medium") date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
}
