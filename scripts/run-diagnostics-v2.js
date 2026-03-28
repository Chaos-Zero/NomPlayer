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
    const { data: retentionData, error: rError } = await supabase.rpc(
      'debug_track_retention',
      { target_track_id: tid },
    );
    if (rError) console.error('Retention Error:', rError);
    else console.log('Retention:', JSON.stringify(retentionData, null, 2));

    const { data: referenceData, error: fError } = await supabase.rpc(
      'find_track_references',
      { target_track_id: tid },
    );
    if (fError) console.error('Reference Error:', fError);
    else console.log('References:', JSON.stringify(referenceData, null, 2));
  }
}

run();
