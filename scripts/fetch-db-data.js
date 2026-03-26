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
const supabaseKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase configuration in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('Fetching tournaments...');
  const { data: tournaments, error: tError } = await supabase
    .from('tournaments')
    .select('id, slug, name, sequence_number')
    .order('sequence_number');

  if (tError) {
    console.error('Error fetching tournaments:', tError);
  } else {
    console.log('Tournaments count:', tournaments.length);
    console.log(JSON.stringify(tournaments, null, 2));
  }

  console.log('\nFetching 5 sample tracks...');
  const { data: tracks, error: trError } = await supabase
    .from('tracks')
    .select('id, canonical_game_title, canonical_track_title')
    .limit(5);

  if (trError) {
    console.error('Error fetching tracks:', trError);
  } else {
    console.log('Sample Tracks:');
    console.log(JSON.stringify(tracks, null, 2));
  }
}

main();
