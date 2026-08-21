import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";

/**
 * Integratietest tegen de echte Supabase-database: schrijft een tijdelijk project
 * met een controle en bevindingen weg, leest ze terug en ruimt alles op.
 *
 * Dit bestand heet bewust .dbtest.ts en valt daardoor buiten `npm test`, zodat de
 * unittests nooit ongemerkt de database aanraken. Uitvoeren met:
 *
 *   npm run test:db
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = Boolean(url && key);

const supabase = enabled ? createClient(url!, key!, { auth: { persistSession: false } }) : null;
const createdProjects: string[] = [];

afterAll(async () => {
  // Cascade ruimt documenten, checks en findings mee op.
  for (const id of createdProjects) {
    await supabase?.from("projects").delete().eq("id", id);
  }
});

describe.runIf(enabled)("opslag van AI-controles in Supabase", () => {
  it("slaat een controle met bevindingen op en leest ze terug", async () => {
    const client = supabase!;

    const { data: project, error: projectError } = await client
      .from("projects")
      .insert({
        project_number: `TEST-${Date.now()}`,
        name: "Integratietest AI-opslag",
        quantity: 1,
      })
      .select("id")
      .single();

    expect(projectError).toBeNull();
    createdProjects.push(project!.id);

    const { data: document, error: documentError } = await client
      .from("project_documents")
      .insert({
        project_id: project!.id,
        file_name: "test.pdf",
        file_type: "pdf",
        storage_path: `projects/${project!.id}/test-${Date.now()}.pdf`,
        file_size: 1024,
        document_role: "offer",
      })
      .select("id")
      .single();

    expect(documentError).toBeNull();

    const { error: contentError } = await client.from("document_contents").insert({
      document_id: document!.id,
      extracted_text: "[pagina 1]\nAantal units: 4",
      extraction_status: "completed",
      page_count: 1,
    });
    expect(contentError).toBeNull();

    const { data: check, error: checkError } = await client
      .from("ai_checks")
      .insert({
        project_id: project!.id,
        status: "completed",
        model: "mock-v2",
        prompt_version: "work-preparation-v2",
        profile_label: "Brouwer Werkvoorbereiding Check v1",
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        duration_ms: 1234,
        documents_analyzed: 1,
        documents_unsupported: 2,
        findings_rejected: 1,
      })
      .select("id")
      .single();

    expect(checkError).toBeNull();

    const { error: findingError } = await client.from("ai_findings").insert({
      ai_check_id: check!.id,
      finding_type: "discrepancy",
      check_area: "offer_vs_drawing",
      severity: "high",
      category: "quantity",
      title: "Aantal units wijkt af",
      description: "Twee documenten noemen een verschillend aantal.",
      source_document_id: document!.id,
      source_reference: "Pagina 1",
      source_quote: "Aantal units: 4",
      confidence: "high",
    });
    expect(findingError).toBeNull();

    const { data: readBack } = await client
      .from("ai_checks")
      .select("*, ai_findings(*)")
      .eq("id", check!.id)
      .single();

    expect(readBack!.prompt_version).toBe("work-preparation-v2");
    expect(readBack!.profile_label).toBe("Brouwer Werkvoorbereiding Check v1");
    expect(readBack!.duration_ms).toBe(1234);
    expect(readBack!.documents_unsupported).toBe(2);
    expect(readBack!.findings_rejected).toBe(1);
    expect(readBack!.ai_findings).toHaveLength(1);
    expect(readBack!.ai_findings[0].status).toBe("open");
    expect(readBack!.ai_findings[0].finding_type).toBe("discrepancy");
    expect(readBack!.ai_findings[0].check_area).toBe("offer_vs_drawing");
    expect(readBack!.ai_findings[0].source_quote).toBe("Aantal units: 4");
  });

  it("levert pilotmetingen op via de view", async () => {
    const client = supabase!;

    const { data: project } = await client
      .from("projects")
      .insert({
        project_number: `TEST-PILOT-${Date.now()}`,
        name: "Integratietest pilotmeting",
        quantity: 1,
      })
      .select("id")
      .single();

    createdProjects.push(project!.id);

    const { data: document, error: documentError } = await client
      .from("project_documents")
      .insert({
        project_id: project!.id,
        file_name: "offerte.pdf",
        file_type: "pdf",
        storage_path: `projects/${project!.id}/pilot-${Date.now()}.pdf`,
        file_size: 512,
        document_role: "offer",
      })
      .select("id")
      .single();
    expect(documentError).toBeNull();

    const { data: check, error: checkError } = await client
      .from("ai_checks")
      .insert({
        project_id: project!.id,
        status: "completed",
        model: "mock-v2",
        prompt_version: "work-preparation-v2",
        duration_ms: 850,
        documents_analyzed: 1,
      })
      .select("id")
      .single();
    expect(checkError).toBeNull();

    const base = {
      ai_check_id: check!.id,
      check_area: "offer_vs_drawing",
      category: "quantity",
      source_document_id: document!.id,
      source_reference: "Pagina 1",
      source_quote: "4 plafondarmaturen",
      confidence: "high",
      description: "Testconstatering voor de pilotmeting.",
    };

    const { error: findingsError } = await client.from("ai_findings").insert([
      { ...base, finding_type: "discrepancy", severity: "high", title: "A", status: "accepted" },
      { ...base, finding_type: "missing", severity: "medium", title: "B", status: "rejected" },
      { ...base, finding_type: "attention", severity: "low", title: "C", status: "needs_review" },
      // status expliciet meegeven: bij een batch-insert vult PostgREST ontbrekende
      // sleutels aan met NULL in plaats van de kolomdefault toe te passen.
      { ...base, finding_type: "attention", severity: "low", title: "D", status: "open" },
    ]);
    expect(findingsError).toBeNull();

    const { data: metrics, error } = await client
      .from("pilot_check_metrics")
      .select("*")
      .eq("ai_check_id", check!.id)
      .single();

    expect(error).toBeNull();
    expect(metrics!.findings_total).toBe(4);
    expect(metrics!.findings_discrepancy).toBe(1);
    expect(metrics!.findings_missing).toBe(1);
    expect(metrics!.findings_attention).toBe(2);
    expect(metrics!.reviewed_accepted).toBe(1);
    expect(metrics!.reviewed_rejected).toBe(1);
    expect(metrics!.reviewed_needs_review).toBe(1);
    expect(metrics!.reviewed_open).toBe(1);
    expect(metrics!.duration_ms).toBe(850);
    expect(metrics!.prompt_version).toBe("work-preparation-v2");
  });

  it("weigert een onbekend finding_type of controlegebied", async () => {
    const client = supabase!;

    const { data: project } = await client
      .from("projects")
      .insert({
        project_number: `TEST-ENUM-${Date.now()}`,
        name: "Integratietest constraints",
        quantity: 1,
      })
      .select("id")
      .single();

    createdProjects.push(project!.id);

    const { data: document } = await client
      .from("project_documents")
      .insert({
        project_id: project!.id,
        file_name: "offerte.pdf",
        file_type: "pdf",
        storage_path: `projects/${project!.id}/enum-${Date.now()}.pdf`,
        file_size: 512,
      })
      .select("id")
      .single();

    const { data: check } = await client
      .from("ai_checks")
      .insert({ project_id: project!.id, status: "completed" })
      .select("id")
      .single();

    const base = {
      ai_check_id: check!.id,
      severity: "high",
      category: "quantity",
      title: "Ongeldig",
      description: "Test",
      source_document_id: document!.id,
      source_reference: "Pagina 1",
      source_quote: "4 plafondarmaturen",
      confidence: "high",
    };

    const verkeerdType = await client
      .from("ai_findings")
      .insert({ ...base, finding_type: "onzin", check_area: "offer_vs_drawing" });
    expect(verkeerdType.error).not.toBeNull();

    const verkeerdGebied = await client
      .from("ai_findings")
      .insert({ ...base, finding_type: "discrepancy", check_area: "elektra" });
    expect(verkeerdGebied.error).not.toBeNull();

    const verkeerdeRol = await client
      .from("project_documents")
      .update({ document_role: "blauwdruk" })
      .eq("id", document!.id);
    expect(verkeerdeRol.error).not.toBeNull();
  });

  it("staat maar één lopende controle per project toe", async () => {
    const client = supabase!;

    const { data: project } = await client
      .from("projects")
      .insert({
        project_number: `TEST-LOCK-${Date.now()}`,
        name: "Integratietest dubbele controle",
        quantity: 1,
      })
      .select("id")
      .single();

    createdProjects.push(project!.id);

    const first = await client
      .from("ai_checks")
      .insert({ project_id: project!.id, status: "processing" })
      .select("id")
      .single();
    expect(first.error).toBeNull();

    const second = await client
      .from("ai_checks")
      .insert({ project_id: project!.id, status: "processing" });

    expect(second.error).not.toBeNull();
    expect(second.error!.code).toBe("23505");
  });

  it("weigert een bevinding zonder brondocument", async () => {
    const client = supabase!;

    const { data: project } = await client
      .from("projects")
      .insert({
        project_number: `TEST-SRC-${Date.now()}`,
        name: "Integratietest bronplicht",
        quantity: 1,
      })
      .select("id")
      .single();

    createdProjects.push(project!.id);

    const { data: check } = await client
      .from("ai_checks")
      .insert({ project_id: project!.id, status: "completed" })
      .select("id")
      .single();

    const { error } = await client.from("ai_findings").insert({
      ai_check_id: check!.id,
      severity: "low",
      category: "other",
      title: "Zonder bron",
      description: "Deze bevinding heeft geen brondocument.",
      source_document_id: null,
      source_reference: "onbekend",
      source_quote: "geen",
      confidence: "low",
      finding_type: "attention",
      check_area: "general",
    });

    expect(error).not.toBeNull();
  });
});
