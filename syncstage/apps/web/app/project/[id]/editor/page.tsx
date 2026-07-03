import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EditorClient } from "@/components/EditorClient";

export const dynamic = "force-dynamic";

export default async function EditorPage({
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
    .select("id, title, duration")
    .eq("id", params.id)
    .single();
  if (!project) notFound();

  const [{ data: assets }, { data: mapRow }] = await Promise.all([
    supabase.from("assets").select("*").eq("project_id", params.id),
    supabase
      .from("alignment_maps")
      .select("*")
      .eq("project_id", params.id)
      .maybeSingle(),
  ]);

  return (
    <EditorClient
      project={project}
      assets={assets ?? []}
      alignmentRow={mapRow ?? null}
    />
  );
}
