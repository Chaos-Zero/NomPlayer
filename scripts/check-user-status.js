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

async function checkUser() {
  const userId = '98605b4d-8b0c-4427-8181-6aab673755ac';
  console.log(`Checking user: ${userId}`);

  const { data, error } = await supabase.rpc('check_user_active', {
    target_user_id: userId,
  });

  if (error) {
    console.error(error);
    return;
  }

  console.log('User Diagnostic Result:');
  console.log(JSON.stringify(data, null, 2));
}

checkUser();
