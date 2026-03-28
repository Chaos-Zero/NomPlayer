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

async function tryManualDelete() {
  const trackId = 'c6016711-c80a-4af5-af13-c2e3a8669550'; // KoD5B28OvM0
  console.log(`Attempting to manually delete track: ${trackId}`);

  const { error } = await supabase.from('tracks').delete().eq('id', trackId);

  if (error) {
    console.error('DELETE ERROR:', error);
  } else {
    console.log('Successfully deleted (or row already missing).');
  }
}

tryManualDelete();
