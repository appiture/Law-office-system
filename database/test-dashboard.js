import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve('frontend/.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing credentials");
  process.exit(1);
}

const client = createClient(supabaseUrl, supabaseKey);

async function run() {
  // We need to simulate the login to get the data
  // The demo workspace usually uses demo@lawoffice.local or we can just bypass
  
  // Let's just query payment_history and payment_charges directly
  console.log("Checking payment_charges...");
  const { data: charges, error: err1 } = await client.from('payment_charges').select('*').limit(5);
  console.log(err1 ? `Error: ${err1.message}` : `Charges found: ${charges?.length}`);
  
  console.log("Checking payment_history...");
  const { data: history, error: err2 } = await list(client.from('payment_history').select('*').limit(5));
  console.log(err2 ? `Error: ${err2.message}` : `History found: ${history?.length}`);
}

async function list(query) {
  const { data, error } = await query;
  return { data, error };
}

run();
