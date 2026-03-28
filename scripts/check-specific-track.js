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

async function checkSpecificTrack() {
  const videoId = 'lu6u_xHz3Rs';
  console.log(`Checking track for videoId: ${videoId}`);

  const { data: track, error } = await supabase
    .from('track_sources')
    .select(
      `
      track_id,
      tracks (
        id,
        canonical_game_title,
        canonical_track_title,
        track_tournament_appearances (tournament_id),
        track_supports (user_id),
        track_user_listen_history (user_id),
        track_user_feedback (user_id)
      )
    `,
    )
    .eq('external_id', videoId)
    .maybeSingle();

  if (error) {
    console.error(error);
    return;
  }

  if (!track) {
    console.log('No track found for this videoId. (It may have been deleted!)');
    return;
  }

  console.log('Track Details:', JSON.stringify(track, null, 2));

  // Check for JSONB references
  const { data: refs } = await supabase.rpc('find_any_track_reference', {
    target_id: videoId,
  });
  if (refs?.length) {
    console.log(`Found ${refs.length} references in user_player_states:`);
    for (const ref of refs) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', ref.user_id)
        .maybeSingle();
      console.log(
        `  - User ${ref.user_id} (${profile?.username || 'GHOST'}): ${Object.keys(
          ref.full_state,
        )
          .filter((k) => JSON.stringify(ref.full_state[k]).includes(videoId))
          .join(', ')}`,
      );
    }
  } else {
    console.log('No references found in user_player_states.');
  }
}

checkSpecificTrack();
