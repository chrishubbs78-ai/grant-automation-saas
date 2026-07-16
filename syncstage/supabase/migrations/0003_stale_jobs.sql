-- Phase 3 hardening: fail jobs that have been stuck in queued/running for
-- too long (worker crashed, webhook lost, GPU preempted). Workers set their
-- own Modal-level timeouts; this is the backstop that keeps the UI honest
-- and frees the per-user active-job quota.
--
-- Schedule it with pg_cron (enabled by default on Supabase):
--   select cron.schedule('sweep-stale-jobs', '*/10 * * * *',
--                        $$select sweep_stale_jobs()$$);

create or replace function sweep_stale_jobs(
  max_running interval default '2 hours',
  max_queued interval default '6 hours'
)
returns integer
language plpgsql
security definer
as $$
declare
  swept integer;
begin
  with stale as (
    update jobs
    set status = 'failed',
        error = case
          when status = 'running' then 'Timed out: worker did not report completion'
          else 'Expired: no worker picked this job up'
        end,
        finished_at = now()
    where (status = 'running' and started_at < now() - max_running)
       or (status = 'queued' and created_at < now() - max_queued)
    returning 1
  )
  select count(*) into swept from stale;
  return swept;
end;
$$;

revoke execute on function sweep_stale_jobs(interval, interval) from public, anon, authenticated;
