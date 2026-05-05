import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import bcrypt from "https://esm.sh/bcryptjs@2.4.3";

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
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { branch_name, pin } = await req.json();
    if (typeof branch_name !== "string" || branch_name.trim().length < 2) throw new Error("Nama cabang tidak valid");
    if (typeof pin !== "string" || !/^\d{4,6}$/.test(pin)) throw new Error("PIN harus 4-6 digit");

    const admin = createClient(supaUrl, svc);
    const { data: existingRole } = await admin.from("user_roles").select("id").eq("user_id", user.id).maybeSingle();
    if (existingRole) throw new Error("Anda sudah memiliki role");

    await admin.from("user_roles").insert({ user_id: user.id, role: "manager", created_by: user.id });
    const pin_hash = await bcrypt.hash(pin, 10);
    const { error } = await admin.from("branches").insert({ manager_id: user.id, name: branch_name.trim(), pin_hash });
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});