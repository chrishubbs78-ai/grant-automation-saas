import { NextResponse } from "next/server";
import { WorkerCallback } from "@syncstage/shared";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Workers report status/progress here (authenticated by shared secret).
 * They can also write to the jobs table directly with the service-role key;
 * this route exists so workers only need ONE credential (the secret) and so
 * status transitions stay in one place.
 */
export async function POST(request: Request) {
  const secret = request.headers.get("x-syncstage-secret");
  if (!secret || secret !== process.env.WORKER_SHARED_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = WorkerCallback.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const { job_id, status, progress, error, output } = parsed.data;

  const supabase = createServiceClient();
  const update: Record<string, unknown> = {};
  if (status) {
    update.status = status;
    if (status === "running") update.started_at = new Date().toISOString();
    if (status === "succeeded" || status === "failed" || status === "cancelled") {
      update.finished_at = new Date().toISOString();
    }
  }
  if (progress) update.progress = progress;
  if (error !== undefined) update.error = error;
  if (output) update.output = output;

  const { error: dbError } = await supabase
    .from("jobs")
    .update(update)
    .eq("id", job_id);
  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
