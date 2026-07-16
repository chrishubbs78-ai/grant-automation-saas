"use client";

import { createClient } from "@/lib/supabase/client";
import type { AssetKind } from "@syncstage/shared";

/**
 * Upload a file to the uploads bucket under the per-user folder convention
 * (<user_id>/<project_id>/<timestamp>-<name>) and register it in assets.
 */
export async function uploadAsset(opts: {
  projectId: string;
  file: File;
  kind: AssetKind;
  onProgress?: (pct: number) => void;
}): Promise<{ assetId: string; path: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const safeName = opts.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${user.id}/${opts.projectId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("uploads")
    .upload(path, opts.file, {
      contentType: opts.file.type,
      upsert: false,
    });
  if (uploadError) throw uploadError;
  opts.onProgress?.(100);

  const { data: asset, error: insertError } = await supabase
    .from("assets")
    .insert({
      project_id: opts.projectId,
      user_id: user.id,
      kind: opts.kind,
      bucket: "uploads",
      storage_path: path,
      mime_type: opts.file.type,
    })
    .select("id")
    .single();
  if (insertError || !asset) {
    throw insertError ?? new Error("Failed to register asset");
  }

  return { assetId: asset.id, path };
}

/** Get a short-lived signed URL for a private storage object. */
export async function signedUrl(
  bucket: string,
  path: string,
  expiresIn = 3600
): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);
  if (error || !data) throw error ?? new Error("Failed to sign URL");
  return data.signedUrl;
}
