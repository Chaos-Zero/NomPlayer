set shell := ["bash", "-eu", "-o", "pipefail", "-c"]
set dotenv-load := true

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
