import Link from "next/link";

const steps = [
  {
    title: "Upload",
    body: "Drop in a finished song plus a photo (or video) of the singer.",
  },
  {
    title: "Analyze",
    body: "We isolate the vocal, map every beat, pitch curve, and word timestamp.",
  },
  {
    title: "Generate",
    body: "A GPU worker animates your avatar singing the track with accurate mouth sync.",
  },
  {
    title: "Edit",
    body: "Drag word markers on a four-lane timeline to perfect the sync — only the touched seconds re-render.",
  },
  {
    title: "Render",
    body: "Server-side 1080p render in 16:9, 9:16, or 1:1. Download and share.",
  },
];

export default function LandingPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-20">
      <div className="mb-16 text-center">
        <h1 className="mb-4 text-5xl font-bold tracking-tight text-white">
          Sync<span className="text-stage-accent">Stage</span>
        </h1>
        <p className="mx-auto mb-8 max-w-2xl text-lg text-zinc-400">
          Turn a song and a photo into a complete music video. An AI avatar
          sings your track with accurate lip sync, visuals cut to the beat, and
          a timeline editor gives you full control before the final render.
        </p>
        <Link href="/dashboard" className="btn-primary px-6 py-3 text-base">
          Start a project →
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((s, i) => (
          <div key={s.title} className="card">
            <div className="mb-2 text-sm font-mono text-stage-accent2">
              {String(i + 1).padStart(2, "0")}
            </div>
            <h3 className="mb-1 font-semibold text-white">{s.title}</h3>
            <p className="text-sm text-zinc-400">{s.body}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
