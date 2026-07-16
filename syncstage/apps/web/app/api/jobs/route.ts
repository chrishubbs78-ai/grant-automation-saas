import { NextResponse } from "next/server";
import { z } from "zod";
import { JobPayload, JobType } from "@syncstage/shared";
import { createClient } from "@/lib/supabase/server";

const CreateJobBody = z.object({
  projectId: z.string().uuid(),
  type: JobType,
  payload: JobPayload.default({}),
});

/**
 * Which Modal web endpoint kicks off each job type. Set after
 * `modal deploy` prints the endpoint URLs (see infra/README.md).
 */
const WORKER_URLS: Partial<Record<z.infer<typeof JobType>, string | undefined>> = {
  analyze: process.env.MODAL_ANALYZE_URL,
  avatar_generate: process.env.MODAL_AVATAR_URL,
  segment_rerender: process.env.MODAL_AVATAR_URL,
  final_render: process.env.RENDER_WORKER_URL,
};

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = CreateJobBody.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.message },
      { status: 400 }
    );
  }
  const { projectId, type, payload } = parsed.data;

  // RLS guarantees the project belongs to the user.
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .single();
  if (projectError || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // ---- Cost controls (Phase 3) --------------------------------------------
  // 1. Cap concurrent queued/running jobs per user so a stuck client can't
  //    fan out GPU work.
  const { count: activeCount } = await supabase
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .in("status", ["queued", "running"]);
  const maxActive = Number(process.env.MAX_ACTIVE_JOBS_PER_USER ?? 5);
  if ((activeCount ?? 0) >= maxActive) {
    return NextResponse.json(
      { error: `Too many jobs in flight (limit ${maxActive}). Wait for one to finish.` },
      { status: 429 }
    );
  }

  // 2. Monthly final-render quota (free-tier control).
  if (type === "final_render") {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const { count: renderCount } = await supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("type", "final_render")
      .neq("status", "failed")
      .gte("created_at", monthStart.toISOString());
    const monthlyLimit = Number(process.env.RENDER_MONTHLY_LIMIT ?? 20);
    if ((renderCount ?? 0) >= monthlyLimit) {
      return NextResponse.json(
        { error: `Monthly render limit reached (${monthlyLimit}).` },
        { status: 429 }
      );
    }
  }

  const { data: job, error: insertError } = await supabase
    .from("jobs")
    .insert({
      project_id: projectId,
      user_id: user.id,
      type,
      payload,
      status: "queued",
    })
    .select("id")
    .single();
  if (insertError || !job) {
    return NextResponse.json(
      { error: insertError?.message ?? "Insert failed" },
      { status: 500 }
    );
  }

  // Fire-and-forget ping to the worker; workers can also poll via
  // claim_next_job() if no webhook is configured.
  const workerUrl = WORKER_URLS[type];
  if (workerUrl) {
    fetch(workerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-syncstage-secret": process.env.WORKER_SHARED_SECRET ?? "",
      },
      body: JSON.stringify({ job_id: job.id }),
    }).catch((err) => console.error(`Worker ping failed for ${type}:`, err));
  }

  return NextResponse.json({ jobId: job.id });
}
