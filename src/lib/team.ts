export const COLUMNS = ["À faire", "En cours", "Revue QA", "Audit sécu", "Terminé"] as const;
export type TaskColumn = (typeof COLUMNS)[number];

export async function getRole(): Promise<"admin" | "client" | null> {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id);
  if (data?.some((r) => r.role === "admin")) return "admin";
  return "client";
}
