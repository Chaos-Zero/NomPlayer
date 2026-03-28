/* global process */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Manually parse .env
const envPath = path.resolve(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach((line) => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length > 0) {
    env[key.trim()] = valueParts.join('=').trim();
  }
});

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey =
  env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
  env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function findChildTables() {
  console.log('Finding all tables referencing public.tracks...');

  // Need raw SQL for this. I'll use a diagnostic RPC.
  const { data, error } = await supabase.rpc('execute_sql_diagnostic', {
    sql_query: `
      select
        fk.table_name,
        fk.column_name,
        rc.delete_rule
      from information_schema.key_column_usage fk
      join information_schema.referential_constraints rc on rc.constraint_name = fk.constraint_name
      where fk.referenced_table_name = 'tracks'
        and fk.referenced_table_schema = 'public'
    `,
  });

  if (error) {
    console.error(error);
    return;
  }

  console.log('Child Tables:', JSON.stringify(data, null, 2));
}

findChildTables();
