import { createClient } from "@supabase/supabase-js";
import { requiredEnv } from "./config.ts";

export const createAdminClient = () =>
  createClient(requiredEnv("PROJECT_URL"), requiredEnv("SERVICE_ROLE_KEY"), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

export const createUserClient = (authorization: string) =>
  createClient(requiredEnv("PROJECT_URL"), requiredEnv("PROJECT_ANON_KEY"), {
    global: {
      headers: { Authorization: authorization },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });


