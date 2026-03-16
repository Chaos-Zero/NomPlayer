set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

deploy:
    git push github main

supabase-start:
    npx supabase start

supabase-stop:
    npx supabase stop

supabase-status:
    npx supabase status

supabase-login:
    npx supabase login

supabase-link ref:
    npx supabase link --project-ref {{ref}}

supabase-push:
    npx supabase db push

supabase-pull:
    npx supabase db pull

supabase-migration name:
    npx supabase migration new {{name}}

supabase-reset:
    npx supabase db reset
