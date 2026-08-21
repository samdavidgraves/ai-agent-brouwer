import { getSupabaseClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/uuid";
import type { Project, ProjectWithDocuments } from "@/types/database";

export async function getProjects(): Promise<Project[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as Project[];
}

export async function getProject(id: string): Promise<ProjectWithDocuments | null> {
  if (!isUuid(id)) return null;

  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("projects")
    .select("*, project_documents(*)")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const project = data as ProjectWithDocuments;
  project.project_documents.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return project;
}
