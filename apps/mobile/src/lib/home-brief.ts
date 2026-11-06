type ReadyHome = {
  accessRole: "owner" | "member";
  dashboardState: "EMPTY" | "EARLY" | "ACTIVE" | "ATTENTION" | "STABLE";
  attentionItems: Array<{ title: string; explanation: string; cta: string }>;
  upcoming: Array<{ title: string; detail: string; timing: string; cta: string }>;
};
export function homeBrief(home: ReadyHome, unavailable: boolean) {
  if (unavailable) return { title: "Your latest update is incomplete.", detail: "We can’t confirm everything that needs attention. Available information is still below.", kind: "retry" as const, action: "Check again" };
  const attention = home.attentionItems[0];
  if (attention) return { title: attention.title, detail: attention.explanation, kind: "attention" as const, action: attention.cta };
  const upcoming = home.upcoming[0];
  if (upcoming) return { title: upcoming.title, detail: [upcoming.detail, upcoming.timing].filter(Boolean).join(" · "), kind: "upcoming" as const, action: upcoming.cta || "View details" };
  if (home.dashboardState === "EMPTY") return home.accessRole === "member"
    ? { title: "A place for shared responsibilities.", detail: "See your household and the care tasks you can help with.", kind: "care" as const, action: "Open Care" }
    : { title: "A little less to keep in mind.", detail: "Start with one bill you want under control. A provider connection is optional.", kind: "add" as const, action: "Add your first bill" };
  if (home.dashboardState === "EARLY") return { title: "Your home is taking shape.", detail: "Your saved information is here when you need it. Add the next thing at your own pace.", kind: "browse" as const, action: home.accessRole === "member" ? "Open Care" : "View bills" };
  if (home.dashboardState === "ACTIVE") return { title: "Here’s what’s changed at home.", detail: "Review your recent updates below and return to the details whenever you need them.", kind: "browse" as const, action: home.accessRole === "member" ? "Open Care" : "View bills" };
  return { title: "Nothing urgent in your saved information.", detail: "Rezlee has no outstanding actions in the information currently available. This isn’t a live check of your accounts.", kind: "browse" as const, action: home.accessRole === "member" ? "Open Care" : "View bills" };
}
