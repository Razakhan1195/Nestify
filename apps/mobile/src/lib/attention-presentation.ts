type AttentionCopy = { title: string; explanation: string; cta: string; sourceType: string; eventType: string; billId: string | null; taskId: string | null; documentId: string | null; providerId: string | null; issueId: string | null };

/** Adapt the deployed legacy copy without changing task titles or task state. */
export function presentAttentionItem<T extends AttentionCopy>(item: T): T {
  let title = item.title, explanation = item.explanation;
  if (item.sourceType === "care" && item.eventType === "maintenance_due" && title.endsWith(" is due")) {
    const taskTitle = title.slice(0, -" is due".length);
    if (explanation === taskTitle + " is past due.") explanation = "Overdue. Review the date or complete the task when finished.";
    else {
      const prefix = taskTitle + " is due in ";
      const remaining = explanation.startsWith(prefix) ? explanation.slice(prefix.length).match(/^(\d+) days?\.$/) : null;
      if (remaining) {
        const days = Number(remaining[1]);
        explanation = days === 0 ? "Due today." : days === 1 ? "Due tomorrow." : `Due in ${days} days.`;
      }
    }
    title = taskTitle;
  }
  // These buttons open details. Only the save action inside a task completes it.
  const cta = item.billId ? "View bill" : item.taskId ? "View task" : item.documentId ? "View record"
    : item.providerId ? "View connection" : item.issueId ? "View issue" : item.cta;
  return {...item, title, explanation, cta};
}
