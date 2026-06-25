// Centralized demo dataset for the Dwellwise demo account.
//
// All data is defined relative to "today" so the dashboard always looks fresh
// (upcoming bills stay upcoming, the overdue item stays overdue). Everything is
// keyed with stable `marker` values so seeding is idempotent and the demo data
// can be identified, updated, or removed later without touching real user rows.
//
// This file contains NO database or React logic — it is pure data so it stays
// easy to edit and easy to swap for real content.

export const DEMO_EMAIL = "razakhan92@gmail.com";

// A stable marker stored on the first seeded bill. Its presence means the demo
// account has already been seeded, so we never duplicate.
export const DEMO_SEED_MARKER = "demo-seed-v1";

function iso(offsetDays: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export type DemoBill = {
  marker: string;
  name: string;
  provider_name: string;
  category: string;
  amount: number;
  amount_paid: number;
  due_date: string;
  frequency: string;
  payment_status: "unpaid" | "scheduled" | "paid" | "overdue";
  status: string;
  account_number_masked: string | null;
  notes: string | null;
  ai_note: string | null;
};

export function demoBills(): DemoBill[] {
  return [
    {
      marker: "demo-rogers",
      name: "Rogers Internet",
      provider_name: "Rogers",
      category: "Internet",
      amount: 89.99,
      amount_paid: 0,
      due_date: iso(2),
      frequency: "monthly",
      payment_status: "unpaid",
      status: "due_soon",
      account_number_masked: "•••• 4821",
      notes: "Ignite 1 Gbps plan. Promo pricing ends in 3 months.",
      ai_note: null,
    },
    {
      marker: "demo-hydro",
      name: "Toronto Hydro",
      provider_name: "Toronto Hydro",
      category: "Electricity",
      amount: 162.43,
      amount_paid: 0,
      due_date: iso(4),
      frequency: "monthly",
      payment_status: "unpaid",
      status: "due_soon",
      account_number_masked: "•••• 0937",
      notes: "Time-of-use pricing.",
      ai_note: "This bill is about 12% higher than your 3-month average. Cooling use is likely the driver.",
    },
    {
      marker: "demo-water",
      name: "City of Toronto Water",
      provider_name: "City of Toronto",
      category: "Water",
      amount: 78.2,
      amount_paid: 0,
      due_date: iso(-3),
      frequency: "quarterly",
      payment_status: "overdue",
      status: "overdue",
      account_number_masked: "•••• 5512",
      notes: "Water and sewer — billed quarterly.",
      ai_note: null,
    },
    {
      marker: "demo-enbridge",
      name: "Enbridge Gas",
      provider_name: "Enbridge",
      category: "Gas",
      amount: 54.67,
      amount_paid: 0,
      due_date: iso(11),
      frequency: "monthly",
      payment_status: "unpaid",
      status: "upcoming",
      account_number_masked: "•••• 7745",
      notes: "Lower usage heading into summer.",
      ai_note: null,
    },
    {
      marker: "demo-insurance",
      name: "Intact Home Insurance",
      provider_name: "Intact Insurance",
      category: "Insurance",
      amount: 132.5,
      amount_paid: 0,
      due_date: iso(19),
      frequency: "monthly",
      payment_status: "unpaid",
      status: "upcoming",
      account_number_masked: "•••• 2210",
      notes: "Homeowner policy. Renews annually in the fall.",
      ai_note: null,
    },
    {
      marker: "demo-proptax",
      name: "City of Toronto Property Tax",
      provider_name: "City of Toronto",
      category: "Property tax",
      amount: 421.0,
      amount_paid: 0,
      due_date: iso(24),
      frequency: "monthly",
      payment_status: "scheduled",
      status: "scheduled",
      account_number_masked: "•••• 8830",
      notes: "Interim installment on pre-authorized payment plan.",
      ai_note: null,
    },
  ];
}

export type DemoRepair = {
  marker: string;
  title: string;
  project_type: string;
  room_or_area: string;
  status: "planning" | "in_progress" | "scheduled" | "completed";
  priority: "low" | "normal" | "high";
  budget: number | null;
  notes: string;
};

export function demoRepairs(): DemoRepair[] {
  return [
    {
      marker: "demo-dishwasher",
      title: "Dishwasher leaking onto kitchen floor",
      project_type: "Appliance",
      room_or_area: "Kitchen",
      status: "in_progress",
      priority: "high",
      budget: 220,
      notes:
        "Pooling water under the front of the unit after each cycle. Likely door gasket or drain hose. Appliance tech booked for Thursday.",
    },
    {
      marker: "demo-furnace",
      title: "Furnace making a rattling noise",
      project_type: "HVAC",
      room_or_area: "Basement",
      status: "planning",
      priority: "normal",
      budget: null,
      notes:
        "Rattle on startup, runs quieter once warmed up. Getting a second quote before booking HVAC service.",
    },
    {
      marker: "demo-bathfan",
      title: "Bathroom exhaust fan not working",
      project_type: "Electrical",
      room_or_area: "Main bathroom",
      status: "scheduled",
      priority: "normal",
      budget: 140,
      notes: "Fan stopped spinning. Electrician scheduled for next week to replace the motor.",
    },
    {
      marker: "demo-window",
      title: "Draft from living room window",
      project_type: "Roof & exterior",
      room_or_area: "Living room",
      status: "completed",
      priority: "low",
      budget: 35,
      notes: "Re-caulked and added weatherstripping. Draft resolved.",
    },
  ];
}

export type DemoTask = {
  marker: string;
  title: string;
  description: string;
  due_date: string;
  recurrence: string;
  status: string;
};

export function demoTasks(): DemoTask[] {
  return [
    {
      marker: "demo-furnace-filter",
      title: "Replace furnace filter",
      description: "A clean filter keeps airflow strong and lowers energy use. Overdue protects your HVAC.",
      due_date: iso(-2),
      recurrence: "quarterly",
      status: "open",
    },
    {
      marker: "demo-smoke-alarm",
      title: "Test smoke & CO alarms",
      description: "Press test on each alarm and replace batteries if needed. Quick safety win.",
      due_date: iso(6),
      recurrence: "biannual",
      status: "open",
    },
    {
      marker: "demo-dryer-vent",
      title: "Clean dryer vent",
      description: "Lint buildup is a common fire hazard and makes the dryer work harder.",
      due_date: iso(14),
      recurrence: "annual",
      status: "open",
    },
    {
      marker: "demo-hvac-tuneup",
      title: "Schedule HVAC maintenance",
      description: "A pre-season tune-up prevents breakdowns and keeps the warranty valid.",
      due_date: iso(30),
      recurrence: "annual",
      status: "open",
    },
  ];
}

export type DemoDocument = {
  marker: string;
  title: string;
  document_type: string;
  issued_on: string | null;
  expires_on: string | null;
  notes: string | null;
};

export function demoDocuments(): DemoDocument[] {
  return [
    {
      marker: "demo-doc-insurance",
      title: "Intact home insurance policy",
      document_type: "Insurance",
      issued_on: iso(-300),
      expires_on: iso(65),
      notes: "Annual homeowner policy. Renews in the fall.",
    },
    {
      marker: "demo-doc-warranty",
      title: "Carrier furnace warranty",
      document_type: "Warranty",
      issued_on: iso(-700),
      expires_on: iso(400),
      notes: "10-year parts warranty — keep proof of annual servicing.",
    },
    {
      marker: "demo-doc-proptax",
      title: "2026 property tax notice",
      document_type: "Tax",
      issued_on: iso(-40),
      expires_on: null,
      notes: "City of Toronto interim and final billing schedule.",
    },
    {
      marker: "demo-doc-mortgage",
      title: "Mortgage renewal reminder",
      document_type: "Statement",
      issued_on: iso(-10),
      expires_on: iso(120),
      notes: "Term renews in ~4 months. Start rate shopping ~90 days out.",
    },
  ];
}

// Document-driven reminders (auto-created as maintenance tasks) so renewals show
// up in upcoming work the way a real user's would.
export function demoDocumentReminders(): DemoTask[] {
  return [
    {
      marker: "demo-reminder-insurance",
      title: "Review home insurance before renewal",
      description: "From document: Intact home insurance policy. Compare coverage before it auto-renews.",
      due_date: iso(50),
      recurrence: "annual",
      status: "open",
    },
    {
      marker: "demo-reminder-mortgage",
      title: "Start mortgage renewal rate shopping",
      description: "From document: Mortgage renewal reminder. Lock a rate before the term ends.",
      due_date: iso(90),
      recurrence: "one-time",
      status: "open",
    },
  ];
}
