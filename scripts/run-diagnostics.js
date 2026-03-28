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

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase configuration');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const TRACKS_TO_CHECK = [
  '4e25e24b-268b-43a3-bc49-e7236a0677d9',
  '1fe91a66-e335-4ba8-987d-f89a31e8178f',
  'c6016711-c80a-4af5-af13-c2e3a8669550',
];

async function run() {
  for (const tid of TRACKS_TO_CHECK) {
    console.log(`\nDiagnosing track ${tid}...`);
    const { data, error } = await supabase.rpc('debug_track_retention', {
      target_track_id: tid,
    });
    if (error) {
      if (error.code === 'P0001') {
        console.log('Diagnostic RPC not found yet. Please push migrations.');
        return;
      }
      console.error('Error:', error);
    } else {
      console.log(JSON.stringify(data, null, 2));
    }
  }
}

run();
