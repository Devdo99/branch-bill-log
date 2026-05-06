import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import bcrypt from "https://esm.sh/bcryptjs@2.4.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supaUrl, svc);

    const { branch_id, pin } = await req.json();
    if (typeof branch_id !== "string" || typeof pin !== "string" || !/^\d{4,6}$/.test(pin)) {
      return new Response(JSON.stringify({ error: "Input tidak valid" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: branch } = await admin.from("branches").select("id, name, pin_hash").eq("id", branch_id).maybeSingle();
    if (!branch) throw new Error("Cabang tidak ditemukan");
    const ok = await bcrypt.compare(pin, branch.pin_hash);
    if (!ok) {
      return new Response(JSON.stringify({ error: "PIN salah" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find or create the synthetic kasir user for this branch
    let kasirUserId: string | null = null;
    const { data: bu } = await admin.from("branch_users").select("user_id").eq("branch_id", branch_id).limit(1).maybeSingle();
    if (bu) {
      kasirUserId = bu.user_id;
    } else {
      const email = `kasir+${branch_id}@notaku.app`;
      const password = crypto.randomUUID() + crypto.randomUUID();
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { full_name: `Kasir ${branch.name}` },
      });
      if (cErr) throw cErr;
      kasirUserId = created.user!.id;
      await admin.from("profiles").upsert({ id: kasirUserId, full_name: `Kasir ${branch.name}` });
      await admin.from("user_roles").insert({ user_id: kasirUserId, role: "kasir" });
      await admin.from("branch_users").insert({ branch_id, user_id: kasirUserId });
    }

    // Look up email for the kasir user
    const { data: userRes, error: gErr } = await admin.auth.admin.getUserById(kasirUserId!);
    if (gErr || !userRes?.user?.email) throw new Error("Gagal mengambil akun kasir");
    const email = userRes.user.email;

    // Generate magiclink to mint a session for the client
    const { data: link, error: lErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (lErr) throw lErr;
    const token_hash = (link as any)?.properties?.hashed_token;
    if (!token_hash) throw new Error("Gagal membuat token sesi");

    return new Response(JSON.stringify({ email, token_hash }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
