set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

deploy:
    git push github main

supabase-start:
    npx supabase start

supabase-stop:
    npx supabase stop

supabase-status:
    npx supabase status

supabase-push:
    npx supabase db push

supabase-pull:
    npx supabase db pull
