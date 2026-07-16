import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProjectClient } from "@/components/ProjectClient";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", params.id)
    .single();
  if (!project) notFound();

  const [{ data: assets }, { data: jobs }] = await Promise.all([
    supabase
      .from("assets")
      .select("*")
      .eq("project_id", params.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("jobs")
      .select("*")
      .eq("project_id", params.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return (
    <ProjectClient
      project={project}
      initialAssets={assets ?? []}
      initialJobs={jobs ?? []}
    />
  );
}
