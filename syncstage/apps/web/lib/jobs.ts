"use client";

import type { JobPayload, JobType } from "@syncstage/shared";

/**
 * Enqueue a job via the API route. The route inserts a row in the jobs table
 * (which Realtime broadcasts) and pings the matching Modal worker webhook.
 */
export async function enqueueJob(
  projectId: string,
  type: JobType,
  payload: JobPayload = {}
): Promise<{ jobId: string }> {
  const res = await fetch("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, type, payload }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to enqueue ${type} job`);
  }
  return res.json();
}
