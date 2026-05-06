import { createClient } from "https://esm.sh/@supabase/supabase-js@2.102.1";
import { requiredEnv } from "./config.ts";

export const createAdminClient = () =>
  createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

export const createUserClient = (authorization: string) =>
  createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_ANON_KEY"), {
    global: {
      headers: { Authorization: authorization },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

