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

async function findGhostTracks() {
  const { data: ghosts } = await supabase
    .from('tracks')
    .select(`id, canonical_track_title, track_sources (external_id)`)
    .or(
      'canonical_game_title.is.null,canonical_game_title.eq."",canonical_track_title.is.null,canonical_track_title.eq.""',
    )
    .limit(3);

  if (!ghosts?.length) return;

  for (const track of ghosts) {
    console.log(
      `\nTrack ${track.id} (${track.track_sources?.[0]?.external_id}):`,
    );
    const { data: refs } = await supabase.rpc('find_any_track_reference', {
      target_id: track.id,
    });

    if (refs?.length) {
      for (const ref of refs) {
        const nominationList = ref.full_state.nominationList || [];
        const entry = nominationList.find(
          (n) =>
            n.trackId === track.id ||
            n.videoId === track.track_sources?.[0]?.external_id,
        );
        console.log(
          `  User ${ref.user_id} has entry:`,
          JSON.stringify(entry, null, 2),
        );

        // Check if user profile exists
        const { data: profile } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', ref.user_id)
          .maybeSingle();
        console.log(
          `  Username: ${profile?.username || 'GHOST USER (No Profile!)'}`,
        );
      }
    }
  }
}

findGhostTracks();
