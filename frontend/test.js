/* global process */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
  // We don't have the user's JWT, so we can't test RLS easily without auth.
  // Let's just bypass RLS by using service_role key if available, or just check the data.
  // Wait, if it's a local demo, maybe the anon key has bypass rls? No.
  
  // Let's just fetch organizations
  const { data: orgs } = await supabase.from('organizations').select('*');
  console.log("Organizations:", orgs);

  const { data: users } = await supabase.from('users').select('*');
  console.log("Users:", users);
}

check();
