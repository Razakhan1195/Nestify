export const homeTypeOptions = [
  "Detached",
  "Semi-detached",
  "Townhouse",
  "Condo",
  "Apartment",
  "Other",
] as const;

export const ownershipTypeOptions = [
  "Own",
  "Rent",
  "Shared home",
  "Family home",
  "Investment property",
  "Other",
] as const;

export const onboardingGoals = [
  {
    id: "bills",
    title: "Bills and recurring costs",
    description: "Know what is due, what changed, and what your home costs.",
    icon: "receipt",
  },
  {
    id: "maintenance",
    title: "Maintenance reminders",
    description: "Create a simple rhythm for seasonal and recurring home care.",
    icon: "tool",
  },
  {
    id: "documents",
    title: "Documents and records",
    description: "Make one vault for policies, tax records, warranties, and PDFs.",
    icon: "file-text",
  },
  {
    id: "inventory",
    title: "Warranties and appliances",
    description: "Track model numbers, warranty dates, and important home items.",
    icon: "package",
  },
  {
    id: "projects",
    title: "Repairs and projects",
    description: "Keep renovations, quotes, costs, and service history together.",
    icon: "hammer",
  },
  {
    id: "assistant",
    title: "Home issue help",
    description: "Log problems and decide whether to monitor, maintain, or call help.",
    icon: "sparkles",
  },
] as const;

export const onboardingActions = [
  {
    id: "bills",
    title: "Add your first bill",
    description: "Start with one known home cost. Exact automation can come later.",
    webHref: "/app/bills",
    mobileDestination: "bills",
    cta: "Add bill",
    icon: "receipt",
  },
  {
    id: "maintenance",
    title: "Create one maintenance reminder",
    description:
      "A furnace filter, smoke detector check, or gutter reminder makes the dashboard useful fast.",
    webHref: "/app/maintenance",
    mobileDestination: "care",
    cta: "Add reminder",
    icon: "tool",
  },
  {
    id: "documents",
    title: "Save one important record",
    description:
      "Add an insurance policy, property tax bill, warranty, or manual to start your Home Vault.",
    webHref: "/app/documents",
    mobileDestination: "vault",
    cta: "Save record",
    icon: "file-text",
  },
  {
    id: "inventory",
    title: "Add an appliance or warranty",
    description: "Track a furnace, water heater, fridge, or dishwasher with warranty details.",
    webHref: "/app/inventory",
    mobileDestination: "vault",
    cta: "Add item",
    icon: "package",
  },
  {
    id: "projects",
    title: "Create a repair or project",
    description: "Use this for renovations, quotes, repair costs, and home history.",
    webHref: "/app/projects",
    mobileDestination: "care",
    cta: "Create project",
    icon: "hammer",
  },
  {
    id: "assistant",
    title: "Get help with an issue",
    description: "Capture symptoms and urgency so the issue can become a task or project later.",
    webHref: "/app/help",
    mobileDestination: "assistant",
    cta: "Start issue check",
    icon: "sparkles",
  },
  {
    id: "providers",
    title: "Connect or add providers",
    description: "Provider sync can enrich the dashboard, but it is optional.",
    webHref: "/app/providers",
    mobileDestination: "providers",
    cta: "Review providers",
    icon: "link",
  },
] as const;

export type OnboardingGoalId = (typeof onboardingGoals)[number]["id"];
export type OnboardingAction = (typeof onboardingActions)[number];

export function buildOnboardingPlan(goalIds: readonly string[]) {
  const selected = onboardingActions.filter(
    (action) => goalIds.includes(action.id) || action.id === "providers",
  );
  return selected.length ? selected : onboardingActions.slice(0, 4);
}
