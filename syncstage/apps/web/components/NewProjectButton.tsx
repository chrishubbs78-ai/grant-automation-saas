"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function NewProjectButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function createProject() {
    setBusy(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("projects")
      .insert({ user_id: user.id, title: "Untitled video" })
      .select("id")
      .single();
    setBusy(false);
    if (!error && data) router.push(`/project/${data.id}`);
  }

  return (
    <button className="btn-primary" onClick={createProject} disabled={busy}>
      {busy ? "Creating…" : "+ New project"}
    </button>
  );
}
