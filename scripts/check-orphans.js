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

async function checkOrphans() {
  console.log('Checking for orphaned user_player_states (no profile)...');

  // We can't join directly via Supabase JS without a foreign key relationship known to PostgREST
  // But we can use an RPC or just fetch all and compare (if count is small)

  const { data: allStates } = await supabase
    .from('user_player_states')
    .select('user_id');
  const { data: allProfiles } = await supabase.from('profiles').select('id');

  const profileIds = new Set(allProfiles?.map((p) => p.id) || []);
  const orphanedUserIds =
    allStates
      ?.filter((s) => !profileIds.has(s.user_id))
      .map((s) => s.user_id) || [];

  console.log(`Total States: ${allStates?.length || 0}`);
  console.log(`Total Profiles: ${allProfiles?.length || 0}`);
  console.log(`Orphaned States: ${orphanedUserIds.length}`);

  if (orphanedUserIds.length > 0) {
    console.log('Orphaned User IDs:', orphanedUserIds);
  }
}

checkOrphans();
