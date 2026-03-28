-- Create a simple diagnostic function for SQL execution (ONLY FOR DEBUGGING)
create or replace function public.execute_sql_diagnostic(sql_query text)
returns jsonb
language plpgsql
security definer
as $$
declare
  result jsonb;
begin
  execute format('select jsonb_agg(t) from (%s) t', sql_query) into result;
  return result;
end;
$$;
