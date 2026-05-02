import { createClient } from '@supabase/supabase-js';
/* global process */
import fs from 'fs';
import path from 'path';

// Parse .env
const envPath = path.resolve(process.cwd(), '.env');
let envContent = '';
try {
  envContent = fs.readFileSync(envPath, 'utf8');
} catch (e) {
  console.warn(
    '.env file not found or unreadable. Make sure to run this script from the workspace root context.',
    e.message,
  );
}

const env = {};
envContent.split('\n').forEach((line) => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length > 0) {
    env[key.trim()] = valueParts.join('=').trim();
  }
});

const supabaseUrl = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL;
const supabaseKey =
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
  env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase URL or Key in environment/env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function exportCatalog() {
  console.log('Fetching entire track catalog from Supabase...');
  const snapshotTime = new Date().toISOString();

  let allData = [];
  let from = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('track_catalog')
      .select('*')
      .range(from, from + pageSize - 1)
      .order('track_id'); // Order to ensure consistent pagination

    if (error) {
      console.error('Error fetching tracks:', error);
      process.exit(1);
    }

    if (data && data.length > 0) {
      allData = [...allData, ...data];
      from += pageSize;
      hasMore = data.length === pageSize;
      console.log(`Fetched ${allData.length} tracks...`);
    } else {
      hasMore = false;
    }
  }

  console.log(`Finished fetching! Total tracks: ${allData.length}`);

  // Merge community stats so runtime clients skip the track_stats_summary query
  // for snapshot tracks (only delta tracks will need a targeted stats fetch).
  console.log('Fetching track_stats_summary to embed into snapshot...');
  const { data: statsData, error: statsError } = await supabase
    .from('track_stats_summary')
    .select('track_id, total_comments, average_rating');

  if (statsError) {
    console.warn(
      'Warning: Could not fetch track_stats_summary:',
      statsError.message,
    );
  } else {
    const statsMap = {};
    for (const s of statsData) statsMap[s.track_id] = s;
    for (const track of allData) {
      const s = statsMap[track.track_id];
      if (s) {
        track.total_comments = s.total_comments;
        track.average_rating = s.average_rating;
      }
    }
    console.log(`Embedded stats for ${Object.keys(statsMap).length} tracks.`);
  }

  const payload = {
    exportedAt: snapshotTime,
    totalCount: allData.length,
    tracks: allData,
  };

  const outPath = path.resolve(
    process.cwd(),
    'src',
    'data',
    'catalogSnapshot.json',
  );

  // Ensure directory exists
  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`Successfully exported snapshot to ${outPath}`);
}

exportCatalog();
