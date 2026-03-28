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
  const trackId = '8a4f9124-6f40-42b7-a3f3-2d11e5a1b822';
  console.log(`Attempting to manually delete track: ${trackId}`);

  const { error } = await supabase.from('tracks').delete().eq('id', trackId);

  if (error) {
    console.error('DELETE ERROR:', error);
  } else {
    console.log('Successfully deleted (or row already missing).');
  }
}

tryManualDelete();
