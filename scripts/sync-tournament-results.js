/* global process */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// --- Configuration ---
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
const CSV_PATH = '/tmp/vgmc_results.csv';

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase configuration');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// --- Normalization Logic (inspired by merge_retirees_into_vgmclist.py) ---

function normalizeText(text) {
  if (!text) return '';
  // Basic normalization: lowercase and remove special chars
  let normalized = text.toLowerCase();
  normalized = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // Remove accents
  normalized = normalized.replace(/&/g, ' and ');
  normalized = normalized.replace(/[^a-z0-9]/g, ' '); // Keep only alphanumeric
  normalized = normalized.replace(/\s+/g, ' ').trim();
  return normalized;
}

function aliasGame(text) {
  if (!text) return '';
  let t = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  t = t.replace(/:.*$/, ''); // Remove everything after colon
  t = t.replace(/~.*$/, ''); // Remove everything after tilde
  t = t.replace(/\(.*\)/, ''); // Remove parentheticals
  return normalizeText(t);
}

function aliasTrack(text) {
  if (!text) return '';
  let t = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  t = t.replace(/\(.*\)/, ' ');
  t = t.replace(/\bversion\b/gi, ' ');
  t = t.replace(/\bver\.?\b/gi, ' ');
  return normalizeText(t);
}

// Simple similarity score (Jaccard-like or just token overlap)
function similarity(s1, s2) {
  const set1 = new Set(s1.split(' '));
  const set2 = new Set(s2.split(' '));
  const intersection = new Set([...set1].filter((x) => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  return intersection.size / union.size;
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  if (isDryRun) console.log('--- DRY RUN MODE ---');

  // 1. Fetch DB context
  console.log('Fetching tournaments...');
  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('*')
    .order('sequence_number');
  const tournamentMap = {};
  tournaments.forEach((t) => {
    tournamentMap[t.sequence_number] = t.id;
    // Map both sequence and slug-like names
    tournamentMap[`vgmc-${t.sequence_number}`] = t.id;
    tournamentMap[t.name.toLowerCase()] = t.id;
  });

  console.log('Fetching tracks (this may take a few seconds)...');
  const tracks = [];
  const FETCH_BATCH = 1000;
  let offset = 0;
  while (true) {
    const { data: batch, error } = await supabase
      .from('tracks')
      .select('id, canonical_game_title, canonical_track_title')
      .range(offset, offset + FETCH_BATCH - 1);

    if (error) {
      console.error('Error fetching tracks:', error);
      break;
    }
    if (!batch || batch.length === 0) break;
    tracks.push(...batch);
    offset += FETCH_BATCH;
    process.stdout.write(`Loaded ${tracks.length} tracks...\r`);
    if (batch.length < FETCH_BATCH) break;
  }
  console.log(`\nLoaded ${tracks.length} tracks total.`);

  const dbTracks = tracks.map((t) => ({
    id: t.id,
    game: t.canonical_game_title,
    track: t.canonical_track_title,
    normGame: normalizeText(t.canonical_game_title),
    normTrack: normalizeText(t.canonical_track_title),
    aliasGame: aliasGame(t.canonical_game_title),
    aliasTrack: aliasTrack(t.canonical_track_title),
  }));

  // 2. Parse CSV
  console.log(`Reading CSV from ${CSV_PATH}...`);
  let content = fs.readFileSync(CSV_PATH, 'utf8');
  let sanitizedContent = '';
  let inQuotes = false;
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '"') inQuotes = !inQuotes;
    if (inQuotes && (char === '\n' || char === '\r')) sanitizedContent += ' ';
    else sanitizedContent += char;
  }

  const lines = sanitizedContent.split(/\r?\n/);
  let headerIndex = 0;
  while (headerIndex < lines.length && !lines[headerIndex].includes('VGMC'))
    headerIndex++;
  if (headerIndex >= lines.length) {
    console.error('Could not find header with VGMC columns');
    return;
  }

  const parseRow = (line) => {
    const row = [];
    let current = '';
    let rowInQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') rowInQuotes = !rowInQuotes;
      else if (char === ',' && !rowInQuotes) {
        row.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    row.push(current.trim());
    return row.map((r) => r.replace(/^"|"$/g, '').trim());
  };

  const header = parseRow(lines[headerIndex]);
  const tournamentCols = [];
  for (let i = 0; i < header.length; i++) {
    const match =
      header[i].match(/VGMC\s*(\d+)/i) || header[i].match(/VGMC[\s\n]*(\d+)/i);
    if (match) {
      const seq = parseInt(match[1]);
      if (tournamentMap[seq]) {
        tournamentCols.push({
          index: i,
          seq,
          id: tournamentMap[seq],
          name: header[i].replace(/\n/g, ' '),
        });
      }
    }
  }
  console.log(`Found ${tournamentCols.length} tournament columns in CSV.`);

  const results = { matched: 0, unmatched: 0, unmatchedList: [], updates: [] };

  // 3. Match rows
  for (let i = headerIndex + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const row = parseRow(lines[i]);
    const titleInput = row[0];
    if (!titleInput || titleInput === 'Composer') continue;

    const dashIndex = titleInput.indexOf(' - ');
    if (dashIndex === -1) {
      results.unmatched++;
      results.unmatchedList.push({
        title: titleInput,
        reason: 'No " - " separator',
      });
      continue;
    }

    const gameInput = titleInput.substring(0, dashIndex);
    const trackInput = titleInput.substring(dashIndex + 3);
    const normGame = normalizeText(gameInput);
    const normTrack = normalizeText(trackInput);
    const aliasG = aliasGame(gameInput);
    const aliasT = aliasTrack(trackInput);

    let bestMatch = null;
    let bestScore = 0;

    const exactMatch = dbTracks.find(
      (t) => t.normGame === normGame && t.normTrack === normTrack,
    );
    if (exactMatch) {
      bestMatch = exactMatch;
      bestScore = 1.0;
    } else {
      for (const t of dbTracks) {
        let score = 0;
        if (t.aliasGame === aliasG && t.aliasTrack === aliasT) score = 0.95;
        else if (t.aliasTrack === aliasT && normGame.includes(t.aliasGame))
          score = 0.9;
        else {
          const trackSim = similarity(normTrack, t.normTrack);
          const gameSim = similarity(normGame, t.normGame);
          score = trackSim * 0.7 + gameSim * 0.3;
        }
        if (score > bestScore) {
          bestScore = score;
          bestMatch = t;
        }
      }
    }

    if (bestMatch && bestScore > 0.8) {
      results.matched++;
      for (const col of tournamentCols) {
        const val = row[col.index];
        if (val && val.trim()) {
          results.updates.push({
            track_id: bestMatch.id,
            tournament_id: col.id,
            highest_round: val.trim(),
          });
        }
      }
    } else {
      results.unmatched++;
      results.unmatchedList.push({
        title: titleInput,
        bestMatch: bestMatch
          ? `${bestMatch.game} - ${bestMatch.track}`
          : 'None',
        score: bestScore.toFixed(3),
      });
    }
  }

  console.log(`Matched: ${results.matched}`);
  console.log(`Unmatched: ${results.unmatched}`);

  // Save unmatched
  const UNMATCHED_CSV = 'tmp/unmatched_tracks.csv';
  const csvLines = ['Title,Best Match Candidate,Score,Reason'];
  results.unmatchedList.forEach((m) => {
    csvLines.push(
      `"${m.title.replace(/"/g, '""')}", "${(m.bestMatch || '').replace(/"/g, '""')}", ${m.score || ''}, ${m.reason || ''}`,
    );
  });
  fs.writeFileSync(UNMATCHED_CSV, csvLines.join('\n'));
  console.log(`Saved unmatched tracks to ${UNMATCHED_CSV}`);

  // Save for fill_missing_youtube_urls.py
  const FOR_YOUTUBE_CSV = 'tmp/unmatched_for_youtube.csv';
  const youtubeCsvLines = ['Game Name,Track,URL'];
  results.unmatchedList.forEach((m) => {
    // Attempt to split title into Game and Track for the youtube script
    const dashIdx = m.title.indexOf(' - ');
    let g = m.title,
      t = '';
    if (dashIdx !== -1) {
      g = m.title.substring(0, dashIdx);
      t = m.title.substring(dashIdx + 3);
    }
    youtubeCsvLines.push(
      `"${g.replace(/"/g, '""')}","${t.replace(/"/g, '""')}",`,
    );
  });
  fs.writeFileSync(FOR_YOUTUBE_CSV, youtubeCsvLines.join('\n'));
  console.log(`Saved YouTube lookup CSV to ${FOR_YOUTUBE_CSV}`);

  // Save SQL
  const SQL_PATH = 'tmp/tournament_results_update.sql';
  const sqlLines = ['-- Sync Tournament Results', 'BEGIN;', ''];
  results.updates.forEach((u) => {
    const escapedRound = u.highest_round.replace(/'/g, "''");
    sqlLines.push(
      `INSERT INTO public.track_tournament_appearances (track_id, tournament_id, highest_round) VALUES ('${u.track_id}', '${u.tournament_id}', '${escapedRound}') ON CONFLICT (track_id, tournament_id) DO UPDATE SET highest_round = EXCLUDED.highest_round, updated_at = timezone('utc', now());`,
    );
  });
  sqlLines.push('', 'COMMIT;');
  fs.writeFileSync(SQL_PATH, sqlLines.join('\n'));
  console.log(
    `Generated ${results.updates.length} SQL statements in ${SQL_PATH}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
