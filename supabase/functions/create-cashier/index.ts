import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supaUrl, anon, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const admin = createClient(supaUrl, svc);
    const { data: role } = await admin.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
    if (role?.role !== "manager") throw new Error("Hanya manager");

    const { full_name, email, password, branch_id } = await req.json();
    if (typeof full_name !== "string" || full_name.trim().length < 2) throw new Error("Nama tidak valid");
    if (typeof email !== "string" || !/^\S+@\S+\.\S+$/.test(email)) throw new Error("Email tidak valid");
    if (typeof password !== "string" || password.length < 8) throw new Error("Password minimal 8 karakter");
    if (typeof branch_id !== "string") throw new Error("Branch tidak valid");

    // Verify branch belongs to manager
    const { data: branch } = await admin.from("branches").select("id").eq("id", branch_id).eq("manager_id", user.id).maybeSingle();
    if (!branch) throw new Error("Cabang bukan milik Anda");

    // Create user
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name },
    });
    if (cErr) throw cErr;
    const newId = created.user!.id;

    // Ensure profile (trigger should handle, but force update name)
    await admin.from("profiles").upsert({ id: newId, full_name });
    await admin.from("user_roles").insert({ user_id: newId, role: "kasir", created_by: user.id });
    const { error: buErr } = await admin.from("branch_users").insert({ branch_id, user_id: newId });
    if (buErr) throw buErr;

    return new Response(JSON.stringify({ ok: true, user_id: newId }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});