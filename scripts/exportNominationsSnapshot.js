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

async function exportNominations() {
  console.log('Fetching community nominations from Supabase...');
  const snapshotTime = new Date().toISOString();

  const { data, error } = await supabase.rpc(
    'get_community_nominations_catalog',
  );

  if (error) {
    console.error('Error fetching nominations:', error);
    process.exit(1);
  }

  const allData = Array.isArray(data) ? data : [];

  console.log(
    `Finished fetching! Total users with nominations: ${allData.length}`,
  );

  const payload = {
    exportedAt: snapshotTime,
    totalCount: allData.length,
    users: allData,
  };

  const outPath = path.resolve(
    process.cwd(),
    'src',
    'data',
    'userNominationsSnapshot.json',
  );

  // Ensure directory exists
  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`Successfully exported snapshot to ${outPath}`);
}

exportNominations();
