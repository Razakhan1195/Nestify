import type { SupabaseClient } from "@supabase/supabase-js";

import {
  DEMO_EMAIL,
  demoBills,
  demoDocumentReminders,
  demoDocuments,
  demoRepairs,
  demoTasks,
} from "@/lib/demo/demo-data";

export function isDemoEmail(email: string | null | undefined): boolean {
  return Boolean(email && email.trim().toLowerCase() === DEMO_EMAIL);
}

// Seeds realistic demo data for the demo account. Idempotent: it tags the first
// bill with a "demo-" external id and bails early if that already exists, so it
// is safe to call on every login. All writes are best-effort — a failure on one
// table never blocks login or the rest of the seed.
export async function seedDemoData(
  supabase: SupabaseClient,
  userId: string,
  homeId: string,
): Promise<void> {
  try {
    const { data: existing } = await supabase
      .from("bills")
      .select("id")
      .eq("user_id", userId)
      .eq("home_id", homeId)
      .like("external_bill_id", "demo-%")
      .limit(1)
      .maybeSingle();

    if (existing) return; // already seeded

    const base = { user_id: userId, home_id: homeId };

    // Bills
    const billRows = demoBills().map((bill) => ({
      ...base,
      external_bill_id: bill.marker,
      name: bill.name,
      custom_provider_name: bill.provider_name,
      amount: bill.amount,
      amount_paid: bill.amount_paid,
      due_date: bill.due_date,
      frequency: bill.frequency,
      recurrence: bill.frequency,
      payment_status: bill.payment_status,
      status: bill.status,
      account_number_masked: bill.account_number_masked,
      source: "manual",
      notes: bill.notes,
      raw_data: {
        category: bill.category,
        ai_note: bill.ai_note,
        demo: true,
      },
    }));
    await supabase.from("bills").insert(billRows);

    // Repairs (projects)
    const repairRows = demoRepairs().map((repair) => ({
      ...base,
      title: repair.title,
      project_type: repair.project_type,
      room_or_area: repair.room_or_area,
      status: repair.status,
      priority: repair.priority,
      budget: repair.budget,
      notes: repair.notes,
    }));
    await supabase.from("projects").insert(repairRows);

    // Maintenance tasks + document-driven reminders
    const taskRows = [...demoTasks(), ...demoDocumentReminders()].map((task) => ({
      ...base,
      title: task.title,
      description: task.description,
      due_date: task.due_date,
      recurrence: task.recurrence,
      status: task.status,
    }));
    await supabase.from("maintenance_tasks").insert(taskRows);

    // Documents
    const docRows = demoDocuments().map((doc) => ({
      ...base,
      external_document_id: doc.marker,
      title: doc.title,
      document_type: doc.document_type,
      issued_on: doc.issued_on,
      expires_on: doc.expires_on,
      source: "manual",
      notes: doc.notes,
    }));
    await supabase.from("documents").insert(docRows);

    // A couple of recent activity entries so the timeline is not empty.
    await supabase.from("timeline_events").insert([
      {
        ...base,
        event_type: "bill_added",
        title: "Toronto Hydro bill added",
        body: "Flagged as 12% above your 3-month average",
        related_table: "bills",
      },
      {
        ...base,
        event_type: "project_added",
        title: "Logged a repair: dishwasher leaking",
        body: "Appliance tech booked",
        related_table: "projects",
      },
    ]);
  } catch (error) {
    console.warn("[demo:seed] skipped demo seeding", {
      message: error instanceof Error ? error.message : "unknown error",
    });
  }
}
