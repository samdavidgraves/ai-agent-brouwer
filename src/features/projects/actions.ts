"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSupabaseClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/uuid";
import { PROJECT_STATUSES, type ProjectStatus } from "@/types/database";

export type FormState = { error: string | null };

const POSTGRES_UNIQUE_VIOLATION = "23505";

function readText(formData: FormData, field: string): string {
  return String(formData.get(field) ?? "").trim();
}

export async function createProject(
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  const projectNumber = readText(formData, "project_number");
  const name = readText(formData, "name");
  const description = readText(formData, "description");
  const unitType = readText(formData, "unit_type");
  const quantity = Number(readText(formData, "quantity"));

  if (!projectNumber) return { error: "Vul een projectnummer in." };
  if (!name) return { error: "Vul een projectnaam in." };
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { error: "Het aantal units moet een geheel getal van 1 of hoger zijn." };
  }

  let projectId: string;

  try {
    const supabase = requireSupabaseClient();
    const { data, error } = await supabase
      .from("projects")
      .insert({
        project_number: projectNumber,
        name,
        description: description || null,
        unit_type: unitType || null,
        quantity,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === POSTGRES_UNIQUE_VIOLATION) {
        return { error: `Projectnummer ${projectNumber} bestaat al.` };
      }
      return { error: `Opslaan mislukt: ${error.message}` };
    }

    projectId = data.id as string;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Opslaan mislukt." };
  }

  revalidatePath("/");
  redirect(`/projecten/${projectId}`);
}

export async function updateProjectStatus(formData: FormData): Promise<void> {
  const projectId = readText(formData, "project_id");
  const status = readText(formData, "status");

  if (!isUuid(projectId)) throw new Error("Ongeldig project.");
  if (!PROJECT_STATUSES.includes(status as ProjectStatus)) {
    throw new Error(`Onbekende status: ${status}`);
  }

  const supabase = requireSupabaseClient();
  const { error } = await supabase
    .from("projects")
    .update({ status })
    .eq("id", projectId);

  if (error) throw new Error(error.message);

  revalidatePath("/");
  revalidatePath(`/projecten/${projectId}`);
}
