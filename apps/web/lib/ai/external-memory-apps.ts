/** Curated Pipedream apps suitable as an external agent database / memory store. */
export const EXTERNAL_MEMORY_DATABASE_APPS = [
  { id: "postgresql", label: "PostgreSQL" },
  { id: "supabase", label: "Supabase" },
  { id: "mysql", label: "MySQL" },
  { id: "mongodb", label: "MongoDB" },
  { id: "snowflake", label: "Snowflake" },
  { id: "airtable", label: "Airtable" },
  { id: "notion", label: "Notion" },
  { id: "google_sheets", label: "Google Sheets" },
] as const;

export type ExternalMemoryDatabaseAppId =
  (typeof EXTERNAL_MEMORY_DATABASE_APPS)[number]["id"];
