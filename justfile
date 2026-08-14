set shell := ["bash", "-eu", "-o", "pipefail", "-c"]
set dotenv-load := true

# Vite (the site, http://localhost:5173) + wrangler (Cloudflare Functions, port
# 8788, Vite proxies /api/* there, see vite.config.js). Ctrl+C stops both.
run-dev:
    #!/usr/bin/env bash
    set -euo pipefail
    trap 'kill 0' EXIT
    npx wrangler pages dev dist --env-file .env --port 8788 &
    npm run dev

deploy:
    node scripts/exportCatalogSnapshot.js
    node scripts/exportNominationsSnapshot.js
    git add src/data/catalogSnapshot.json src/data/userNominationsSnapshot.json
    MAX_STAGED_FILE_BYTES=31457280 git commit -m "Updating db json" || true
    git push origin main
    git push github main

supabase-start:
    npx supabase start

supabase-stop:
    npx supabase stop

supabase-status:
    npx supabase status

supabase-login:
    npx supabase login

supabase-link:
    @npx supabase link --project-ref "{{ env_var('SUPABASE_PROJECT_REF') }}"

supabase-push:
    npx supabase db push

supabase-pull:
    npx supabase db pull

supabase-migration name:
    npx supabase migration new {{name}}

supabase-reset:
    npx supabase db reset
