import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import {
  encryptIntegrationSecret,
  decryptIntegrationSecret,
} from "@/lib/integrations/crypto";
import {
  getInchurchOverview,
  InchurchApiError,
} from "@/lib/integrations/inchurch-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();
const connectSchema = z.object({
  churchId: idSchema,
  apiKey: z.string().trim().min(1).max(512),
  apiSecret: z.string().min(1).max(2048),
});

const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

/** Revalida permissão em toda requisição; nunca confia no churchId do cliente. */
async function canManageChurch(churchId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: membership } = await supabase
    .from("church_members")
    .select("role")
    .eq("church_id", churchId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .eq("role", "admin")
    .maybeSingle();
  if (membership) return true;
  const { data: master } = await supabase.rpc("is_platform_admin");
  return master === true;
}

function safeApiError(error: unknown): { status: number; message: string } {
  if (error instanceof InchurchApiError) {
    return { status: error.status === 429 ? 429 : 502, message: error.message };
  }
  // Não exponha erros da base, secrets ou detalhes internos ao cliente.
  return { status: 503, message: "Integração indisponível ou configuração pendente." };
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const churchId = url.searchParams.get("churchId");
  if (!churchId || !idSchema.safeParse(churchId).success) {
    return json({ ok: false, error: "Igreja inválida." }, 400);
  }
  if (!(await canManageChurch(churchId))) {
    return json({ ok: false, error: "Sem permissão." }, 403);
  }

  try {
    const admin = await createAdminClientAsync();
    const { data, error } = await admin
      .from("inchurch_connections")
      .select("status, last_checked_at")
      .eq("church_id", churchId)
      .maybeSingle();
    if (error) throw error;

    if (url.searchParams.get("preview") !== "true") {
      return json({ ok: true, connected: !!data, status: data?.status ?? "disconnected",
        lastCheckedAt: data?.last_checked_at ?? null });
    }
    if (!data) return json({ ok: false, error: "Conecte sua conta primeiro." }, 404);

    const { data: stored, error: storedError } = await admin
      .from("inchurch_connections")
      .select("api_key_ciphertext, api_secret_ciphertext")
      .eq("church_id", churchId)
      .single();
    if (storedError || !stored) throw storedError ?? Error("CONNECTION_MISSING");
    const overview = await getInchurchOverview({
      apiKey: await decryptIntegrationSecret(stored.api_key_ciphertext),
      apiSecret: await decryptIntegrationSecret(stored.api_secret_ciphertext),
    });
    return json({ ok: true, ...overview });
  } catch (error) {
    const failure = safeApiError(error);
    return json({ ok: false, error: failure.message }, failure.status);
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return json({ ok: false, error: "Origem inválida." }, 403);
  let raw: unknown;
  try { raw = await request.json(); }
  catch { return json({ ok: false, error: "JSON inválido." }, 400); }
  const parsed = connectSchema.safeParse(raw);
  if (!parsed.success) return json({ ok: false, error: "Credenciais ou igreja inválidas." }, 400);
  const { churchId, apiKey, apiSecret } = parsed.data;
  if (!(await canManageChurch(churchId))) {
    return json({ ok: false, error: "Sem permissão." }, 403);
  }

  try {
    // Falha fechada: se algum escopo necessário faltar, nada é persistido.
    const overview = await getInchurchOverview({ apiKey, apiSecret });
    const admin = await createAdminClientAsync();
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ ok: false, error: "Sessão expirada." }, 401);

    const { error } = await admin.from("inchurch_connections").upsert({
      church_id: churchId,
      api_key_ciphertext: await encryptIntegrationSecret(apiKey),
      api_secret_ciphertext: await encryptIntegrationSecret(apiSecret),
      status: "connected",
      last_checked_at: new Date().toISOString(),
      created_by: user.id,
    }, { onConflict: "church_id" });
    if (error) throw error;
    return json({ ok: true, connected: true, ...overview });
  } catch (error) {
    const failure = safeApiError(error);
    return json({ ok: false, error: failure.message }, failure.status);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return json({ ok: false, error: "Origem inválida." }, 403);
  let raw: unknown;
  try { raw = await request.json(); }
  catch { return json({ ok: false, error: "JSON inválido." }, 400); }
  const parsed = z.object({ churchId: idSchema }).safeParse(raw);
  if (!parsed.success) return json({ ok: false, error: "Igreja inválida." }, 400);
  if (!(await canManageChurch(parsed.data.churchId))) {
    return json({ ok: false, error: "Sem permissão." }, 403);
  }
  try {
    const admin = await createAdminClientAsync();
    const { error } = await admin.from("inchurch_connections")
      .delete().eq("church_id", parsed.data.churchId);
    if (error) throw error;
    return json({ ok: true, connected: false });
  } catch {
    return json({ ok: false, error: "Não foi possível desconectar." }, 503);
  }
}
