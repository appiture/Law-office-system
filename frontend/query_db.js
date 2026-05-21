import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://rowurliqqlrwevcqlbpr.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvd3VybGlxcWxyd2V2Y3FsYnByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0OTY5OTEsImV4cCI6MjA5MjA3Mjk5MX0.fBYnj_ogDYp0e7s9Snvj9PPc9fkU_eFBh6lzqSkRWz8';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  console.log('Querying Supabase database...');
  
  // 1. Check users
  const { data: users, error: usersErr } = await supabase.from('users').select('*');
  console.log('\n--- USERS ---');
  if (usersErr) console.error('Error fetching users:', usersErr);
  else console.log(`Found ${users.length} users:`, users);

  // 2. Check cases
  const { data: cases, error: casesErr } = await supabase.from('cases').select('*');
  console.log('\n--- CASES ---');
  if (casesErr) console.error('Error fetching cases:', casesErr);
  else console.log(`Found ${cases.length} cases:`, cases);

  // 3. Check hearings
  const { data: hearings, error: hearingsErr } = await supabase.from('hearings').select('*');
  console.log('\n--- HEARINGS ---');
  if (hearingsErr) console.error('Error fetching hearings:', hearingsErr);
  else console.log(`Found ${hearings.length} hearings:`, hearings);

  // 4. Check documents
  const { data: docs, error: docsErr } = await supabase.from('documents').select('*');
  console.log('\n--- DOCUMENTS ---');
  if (docsErr) console.error('Error fetching documents:', docsErr);
  else console.log(`Found ${docs.length} documents:`, docs);
}

main().catch(console.error);
