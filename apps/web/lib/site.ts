import { DATA_MODE, publicEnv } from "@/lib/env";

export const SITE_URL = publicEnv.NEXT_PUBLIC_APP_URL;

/** True when the app runs on local mock data instead of Supabase. */
export const USE_MOCK_DATA = DATA_MODE !== "supabase";

export const AGENT_SERVICE_URL =
  process.env.NEXT_PUBLIC_AGENT_SERVICE_URL ?? "http://localhost:8000";
