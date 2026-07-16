import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NewProjectButton } from "@/components/NewProjectButton";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: projects } = await supabase
    .from("projects")
    .select("id, title, status, duration, created_at")
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Your projects</h1>
          <p className="text-sm text-zinc-400">{user.email}</p>
        </div>
        <NewProjectButton />
      </div>

      {!projects?.length ? (
        <div className="card text-center text-zinc-400">
          No projects yet. Create one to get started.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/project/${p.id}`}
              className="card transition-colors hover:border-stage-accent"
            >
              <h3 className="mb-1 font-semibold text-white">{p.title}</h3>
              <div className="flex items-center gap-3 text-xs text-zinc-400">
                <span className="rounded-full bg-zinc-800 px-2 py-0.5">
                  {p.status.replace(/_/g, " ")}
                </span>
                {p.duration && <span>{Math.round(p.duration)}s song</span>}
                <span>{new Date(p.created_at).toLocaleDateString()}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
