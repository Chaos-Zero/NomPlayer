/* global process */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY,
);

async function test() {
  const { data, error } = await supabase.rpc('ingest_youtube_track_sources', {
    youtube_sources: [{ video_id: 'dQw4w9WgXcQ' }],
  });
  console.log('Result:', data, error);
}
test();
