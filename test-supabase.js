import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envFile = fs.existsSync('.env') ? '.env' : '.env.development';
const env = fs
  .readFileSync(envFile, 'utf-8')
  .split('\n')
  .reduce((acc, line) => {
    const [key, ...value] = line.split('=');
    if (key) acc[key.trim()] = value.join('=').trim().replace(/['"]/g, '');
    return acc;
  }, {});

const supabase = createClient(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_ANON_KEY,
);

async function test() {
  const { data, error } = await supabase
    .from('user_playlists')
    .select(
      'id, name, is_public, created_at, updated_at, user_id, user_playlist_tracks(count)',
    )
    .eq('is_active_queue', false)
    .order('created_at', { ascending: false });

  console.log('Error:', error);
  console.log('Data length:', data ? data.length : 0);
  if (data && data.length > 0) console.log('First item:', data[0]);
}

test();
