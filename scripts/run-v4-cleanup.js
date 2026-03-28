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

async function runDirectDelete() {
  const trackIds = [
    '4e25e24b-268b-43a3-bc49-e7236a0677d9',
    'c6016711-c80a-4af5-af13-c2e3a8669550',
    '8a4f9124-6f40-42b7-a3f3-2d11e5a1b822',
  ];

  console.log(`Running direct cleanup for tracks: ${trackIds.join(', ')}`);

  // We'll use the RPC because we can't do complex WHERE NOT EXISTS joins easily with .delete()
  const { data: result, error } = await supabase.rpc(
    'cleanup_orphaned_tracks_v4',
  );

  if (error) {
    console.error('RPC ERROR:', error);
  } else {
    console.log(`Successfully deleted ${result} orphaned tracks.`);
  }
}

runDirectDelete();
