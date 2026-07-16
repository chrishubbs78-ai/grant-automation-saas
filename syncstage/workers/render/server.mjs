/**
 * Tiny HTTP wrapper around the render worker so the app's /api/jobs route can
 * trigger renders via RENDER_WORKER_URL. Deploy anywhere Node + Chrome +
 * ffmpeg run (Fly.io machine, Railway, a Modal container with the node image,
 * or a plain VPS).
 *
 *   POST /render  { "job_id": "..." }   header: x-syncstage-secret
 */

import { createServer } from "node:http";
import { runRenderJob } from "./render.mjs";

const PORT = process.env.PORT ?? 8787;
const SECRET = process.env.WORKER_SHARED_SECRET ?? "";

let busy = false;

createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/render") {
    res.writeHead(404).end();
    return;
  }
  if (!SECRET || req.headers["x-syncstage-secret"] !== SECRET) {
    res.writeHead(401).end(JSON.stringify({ error: "bad secret" }));
    return;
  }

  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const { job_id } = JSON.parse(body || "{}");
    if (!job_id) {
      res.writeHead(400).end(JSON.stringify({ error: "job_id required" }));
      return;
    }
    if (busy) {
      // One render at a time per instance; job stays queued and can be
      // retried or picked up by another instance via claim_next_job().
      res.writeHead(503).end(JSON.stringify({ error: "busy" }));
      return;
    }
    busy = true;
    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, job_id }));
    runRenderJob(job_id)
      .catch(() => {})
      .finally(() => (busy = false));
  });
}).listen(PORT, () => console.log(`render worker listening on :${PORT}`));
