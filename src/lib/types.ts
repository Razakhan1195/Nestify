export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Profile = {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
};

export type Home = {
  id: string;
  user_id: string;
  nickname: string;
  street_address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string;
  home_type: string | null;
  ownership_type: string | null;
  closing_date: string | null;
  approximate_year_built: number | null;
  created_at: string;
  updated_at: string;
};

export type ProviderCategory = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type Provider = {
  id: string;
  user_id: string;
  home_id: string;
  category_id: string | null;
  name: string;
  display_name: string | null;
  provider_priority: number | null;
  connection_status: string;
  health_status: string;
  last_successful_sync_at: string | null;
  next_expected_bill_date: string | null;
  sync_frequency: string | null;
  requires_user_action: boolean;
  user_action_message: string | null;
  data_capabilities: Json;
  deck_connection_id: string | null;
  deck_connection_status: string | null;
  deck_connection_metadata: Json;
  account_number: string | null;
  website_url: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Bill = {
  id: string;
  user_id: string;
  home_id: string;
  provider_id: string | null;
  name: string;
  amount: number | null;
  currency: string;
  due_date: string | null;
  recurrence: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Document = {
  id: string;
  user_id: string;
  home_id: string;
  provider_id: string | null;
  title: string;
  document_type: string | null;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  issued_on: string | null;
  expires_on: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type MaintenanceTask = {
  id: string;
  user_id: string;
  home_id: string;
  provider_id: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  recurrence: string | null;
  status: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Insight = {
  id: string;
  user_id: string;
  home_id: string | null;
  title: string;
  body: string;
  insight_type: string | null;
  source: string | null;
  dismissed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SyncEvent = {
  id: string;
  user_id: string;
  home_id: string | null;
  provider_id: string | null;
  source: string;
  status: string;
  message: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

export type MonthlySummary = {
  id: string;
  user_id: string;
  home_id: string;
  month: string;
  total_bills_amount: number;
  bills_due_count: number;
  maintenance_open_count: number;
  documents_added_count: number;
  summary: string | null;
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: { Row: Profile };
      homes: { Row: Home };
      provider_categories: { Row: ProviderCategory };
      providers: { Row: Provider };
      bills: { Row: Bill };
      documents: { Row: Document };
      maintenance_tasks: { Row: MaintenanceTask };
      insights: { Row: Insight };
      sync_events: { Row: SyncEvent };
      monthly_summaries: { Row: MonthlySummary };
    };
  };
};
