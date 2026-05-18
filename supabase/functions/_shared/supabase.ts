import { createClient } from "@supabase/supabase-js";
import { requiredEnv, env } from "./config.ts";

export const createAdminClient = () =>
  createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );

export const createUserClient = (authorization: string) =>
  createClient(
    requiredEnv("SUPABASE_URL"),
    env("SUPABASE_ANON_KEY", env("PROJECT_ANON_KEY", "")),
    {
      global: {
        headers: { Authorization: authorization },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );

