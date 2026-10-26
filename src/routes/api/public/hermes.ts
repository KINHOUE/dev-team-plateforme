import { createFileRoute } from "@tanstack/react-router";

// Pont entre Hermes (sur le PC) et l'interface.
// GET  -> demandes « À faire » à traiter
// POST { type: "task", id, status?, agent?, result? }
// POST { type: "agent", id, status, current_task? }
function authorized(request: Request) {
  const token = process.env["HERMES_BRIDGE_TOKEN"];
  if (!token) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${token}`;
  // Comparaison à temps constant : évite de révéler le token caractère par caractère
  if (header.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

const MAX_PENDING = 100;

const STATUSES = ["À faire", "En cours", "Revue QA", "Audit sécu", "Terminé"];

export const Route = createFileRoute("/api/public/hermes")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const params = new URL(request.url).searchParams;
        const clientId = params.get("client_id");
        // include_active=1 : renvoie aussi les demandes deja en cours (reprise apres redemarrage)
        const includeActive = params.get("include_active") === "1";
        const wantedStatuses = includeActive ? ["À faire", "En cours"] : ["À faire"];

        let query = supabaseAdmin
          .from("tasks")
          .select("id, client_id, title, description, created_at, status, agent")
          .in("status", wantedStatuses)
          .order("created_at")
          .limit(MAX_PENDING);

        if (clientId) query = query.eq("client_id", clientId);

        const { data, error } = await query;
        if (error) return Response.json({ error: "db" }, { status: 500 });
        return Response.json({ tasks: data, count: data?.length ?? 0, limit: MAX_PENDING });
      },
      POST: async ({ request }) => {
        if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
        const body = (await request.json().catch(() => null)) as {
          id?: unknown;
          type?: unknown;
          status?: unknown;
          agent?: unknown;
          result?: unknown;
          current_task?: unknown;
        } | null;
        if (!body || typeof body.id !== "string")
          return Response.json({ error: "id requis" }, { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        if (body.type === "task") {
          const patch: { updated_at: string; status?: string; agent?: string; result?: string } = {
            updated_at: new Date().toISOString(),
          };
          if (typeof body.status === "string") {
            if (!STATUSES.includes(body.status))
              return Response.json({ error: "statut invalide" }, { status: 400 });
            patch.status = body.status;
          }
          if (typeof body.agent === "string") patch.agent = body.agent.slice(0, 50);
          if (typeof body.result === "string") patch.result = body.result.slice(0, 5000);
          const { error } = await supabaseAdmin.from("tasks").update(patch).eq("id", body.id);
          if (error) return Response.json({ error: "db" }, { status: 500 });
          return Response.json({ ok: true });
        }
        if (body.type === "agent") {
          const status = String(body.status ?? "");
          if (!["actif", "en attente", "hors ligne"].includes(status))
            return Response.json({ error: "statut invalide" }, { status: 400 });
          const { error } = await supabaseAdmin
            .from("agents")
            .update({
              status,
              current_task:
                typeof body.current_task === "string" ? body.current_task.slice(0, 200) : null,
              last_seen: new Date().toISOString(),
            })
            .eq("id", body.id);
          if (error) return Response.json({ error: "db" }, { status: 500 });
          return Response.json({ ok: true });
        }
        return Response.json({ error: "type inconnu" }, { status: 400 });
      },
    },
  },
});
