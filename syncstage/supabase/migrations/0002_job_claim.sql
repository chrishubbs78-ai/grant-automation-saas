-- Atomic job claim for workers (poller mode).
-- Workers normally get triggered via webhook, but this function lets a
-- polling worker safely claim the oldest queued job of the types it handles
-- without double-processing (FOR UPDATE SKIP LOCKED).

create or replace function claim_next_job(worker_types job_type[])
returns setof jobs
language plpgsql
security definer
as $$
declare
  claimed jobs;
begin
  select * into claimed
  from jobs
  where status = 'queued' and type = any (worker_types)
  order by created_at
  limit 1
  for update skip locked;

  if not found then
    return;
  end if;

  update jobs
  set status = 'running', started_at = now()
  where id = claimed.id;

  claimed.status := 'running';
  claimed.started_at := now();
  return next claimed;
end;
$$;

-- Only service role should call this.
revoke execute on function claim_next_job(job_type[]) from public, anon, authenticated;
