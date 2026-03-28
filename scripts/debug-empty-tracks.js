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
  console.error('Missing Supabase configuration in .env');
  console.log('Available keys:', Object.keys(env));
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugEmptyTracks() {
  console.log('Fetching empty tracks...');
  const { data: emptyTracks, error } = await supabase
    .from('tracks')
    .select(
      `
      id,
      canonical_game_title,
      canonical_track_title,
      created_at,
      track_sources (
        external_id,
        cached_title
      )
    `,
    )
    .or(
      'canonical_game_title.is.null,canonical_game_title.eq."",canonical_track_title.is.null,canonical_track_title.eq.""',
    )
    .limit(10);

  if (error) {
    console.error('Error fetching empty tracks:', error);
    return;
  }

  console.log(
    `Found ${emptyTracks.length} tracks with missing metadata (sample):`,
  );
  console.log(JSON.stringify(emptyTracks, null, 2));

  for (const track of emptyTracks) {
    console.log(`\nChecking references for track ${track.id}...`);

    const { count: appearances } = await supabase
      .from('track_tournament_appearances')
      .select('track_id', { count: 'exact', head: true })
      .eq('track_id', track.id);

    const { count: supports } = await supabase
      .from('track_supports')
      .select('track_id', { count: 'exact', head: true })
      .eq('track_id', track.id);

    // Check user player states (nominations etc)
    const { data: playerStates } = await supabase
      .from('user_player_states')
      .select('user_id, state');

    let referencedBy = [];
    if (appearances > 0) referencedBy.push('VGMC Appearance');
    if (supports > 0) referencedBy.push('Formal Support');

    // Debug: check full state of first user
    if (playerStates && playerStates.length > 0) {
      console.log('Debug: Full state of first user (sample):');
      console.log(
        JSON.stringify(playerStates[0].state, null, 2).slice(0, 1000),
      );
      break; // Only need to check once
    }
  }
}

debugEmptyTracks();
