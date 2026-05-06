import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '../frontend/.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
  const { data: orgs, error: orgError } = await supabase.from('organizations').select('*');
  console.log("Organizations:", orgs);

  const { data: users, error: userError } = await supabase.from('users').select('*');
  console.log("Users:", users);
}

check();
