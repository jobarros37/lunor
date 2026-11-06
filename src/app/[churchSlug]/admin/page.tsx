import { PageHeader } from "@/components/ui/page-header";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Download } from "lucide-react";
import { getTenant } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CreateMinistryForm } from "@/components/admin/create-ministry-form";
import { DeleteChurchZone } from "@/components/admin/delete-church";
import { EditChurchName } from "@/components/admin/edit-church-name";
import { DepartmentsManager } from "@/components/admin/departments-manager";
import { CampusesManager } from "@/components/admin/campuses-manager";
import { InviteLink } from "@/components/invite-link";
import { DailyVerseSettings } from "@/components/admin/daily-verse-settings";
import { InchurchIntegration } from "@/components/admin/inchurch-integration";

export default async function AdminPage({
  params,
}: {
  params: Promise<{ churchSlug: string }>;
}) {
  const { churchSlug } = await params;
  const tenant = await getTenant(churchSlug);
  if (!tenant.isCoord) redirect(`/${churchSlug}`);
  const isAdmin = tenant.role === "admin";

  const supabase = await createClient();
  const cid = tenant.church.id;
  const [
    { data: ministries },
    { data: counts },
    { data: departments },
    { data: teamFunctions },
    { data: interesses },
    { data: aptas },
    { data: campuses },
    { data: church },
  ] = await Promise.all([
    supabase
      .from("ministries")
      .select("id, name, slug")
      .eq("church_id", cid)
      .order("name"),
    supabase
      .from("ministry_members")
      .select("ministry_id")
      .eq("church_id", cid)
      .eq("active", true),
    supabase
      .from("departments")
      .select("id, name, ministry_id")
      .eq("church_id", cid)
      .order("name"),
    supabase
      .from("team_functions")
      .select("id, name, ministry_id, department_id")
      .eq("church_id", cid)
      .eq("active", true)
      .order("name"),
    supabase
      .from("member_interests")
      .select("user_id, skill_id, skills!inner(name), profiles!inner(full_name)")
      .eq("church_id", cid),
    supabase
      .from("member_skills")
      .select("user_id, skill_id")
      .eq("church_id", cid)
      .not("approved_by", "is", null),
    supabase
      .from("campuses")
      .select("id, name, active")
      .eq("church_id", cid)
      .order("sort_order")
      .order("name"),
    supabase
      .from("churches")
      .select("settings")
      .eq("id", cid)
      .single(),
  ]);
  const churchSettings =
    church?.settings && typeof church.settings === "object" && !Array.isArray(church.settings)
      ? (church.settings as Record<string, unknown>)
      : {};
  const notificationSettings =
    churchSettings.notifications && typeof churchSettings.notifications === "object"
      ? (churchSettings.notifications as Record<string, unknown>)
      : {};
  const { data: inviteCode } = isAdmin
    ? await supabase.rpc("get_church_invite_code", { p_church: cid })
    : { data: null };

  const countByMinistry = new Map<string, number>();
  for (const c of counts ?? []) {
    countByMinistry.set(
      c.ministry_id,
      (countByMinistry.get(c.ministry_id) ?? 0) + 1
    );
  }

  const jaApto = new Set((aptas ?? []).map((a) => `${a.user_id}:${a.skill_id}`));
  const gapPorSkill = new Map<string, string[]>();
  for (const i of interesses ?? []) {
    if (jaApto.has(`${i.user_id}:${i.skill_id}`)) continue;
    const skill = (i.skills as unknown as { name: string }).name;
    const nome = (i.profiles as unknown as { full_name: string }).full_name;
    gapPorSkill.set(skill, [...(gapPorSkill.get(skill) ?? []), nome]);
  }
  const querCrescer = [...gapPorSkill.entries()].sort(
    (a, b) => b[1].length - a[1].length
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={<>Administração</>}
        description={<>{tenant.church.name}</>}
      />

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nome da igreja</CardTitle>
            <CardDescription>
              Como o sistema aparece para a sua equipe
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EditChurchName
              churchSlug={churchSlug}
              churchId={tenant.church.id}
              currentName={tenant.church.name}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campi</CardTitle>
          <CardDescription>
            Cadastre todos os locais fixos da igreja. Eventos, escalas e Kids
            passam a carregar esse contexto sem assumir que a igreja tem apenas
            um campus.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CampusesManager
            churchSlug={churchSlug}
            churchId={tenant.church.id}
            campuses={campuses ?? []}
          />
        </CardContent>
      </Card>

      {isAdmin && <InchurchIntegration churchId={cid} />}

      {isAdmin && inviteCode && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Convite da equipe</CardTitle>
            <CardDescription>
              Compartilhe o link. O código de segurança fica protegido dentro
              dele.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-zinc-950 dark:border-white/10 dark:bg-[#151518] dark:text-white">
              <InviteLink inviteCode={inviteCode} />
            </div>
          </CardContent>
        </Card>
      )}

      <Link href={`/${churchSlug}/assinatura`} className="block">
        <Card className="transition-colors hover:bg-accent/40">
          <CardContent className="flex items-center justify-between gap-3 py-4">
            <div>
              <p className="font-medium">Assinatura</p>
              <p className="text-sm text-muted-foreground">
                Situação da igreja, como pagar e pedido de isenção
              </p>
            </div>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quem quer crescer</CardTitle>
          <CardDescription>
            Pessoas que têm interesse numa área mas ainda não são aptas —
            candidatas a treinamento.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {querCrescer.length > 0 ? (
            <div className="space-y-3">
              {querCrescer.map(([skill, nomes]) => (
                <div key={skill} className="rounded-2xl border px-4 py-3">
                  <p className="font-medium">
                    {skill}{" "}
                    <span className="text-sm font-normal text-muted-foreground">
                      · {nomes.length}{" "}
                      {nomes.length === 1 ? "interessado" : "interessados"}
                    </span>
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {nomes.join(", ")}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Ninguém com interesse pendente de capacitação por enquanto.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados da igreja</CardTitle>
          <CardDescription>
            Baixe tudo em arquivo aberto (JSON) — os dados são da igreja, não
            nossos. Contém informação pessoal e pode conter dados de menores:
            guarde com cuidado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            nativeButton={false}
            render={<a href={`/${churchSlug}/exportar/igreja`} download />}
          >
            <Download className="size-4" />
            Exportar dados da igreja
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Estrutura das equipes</CardTitle>
          <CardDescription>
            Organize sem duplicidade: primeiro a área, depois os times e, por fim,
            as funções usadas nas escalas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <section className="space-y-3" aria-labelledby="areas-title">
            <div>
              <p id="areas-title" className="font-medium">
                1. Ministérios e áreas
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Exemplos: Louvor, Kids, Produção, Comunicação e Pastoral.
              </p>
            </div>
            <CreateMinistryForm
              churchSlug={churchSlug}
              churchId={tenant.church.id}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              {(ministries ?? []).map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between rounded-xl border px-4 py-3"
                >
                  <p className="font-medium">{m.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {countByMinistry.get(m.id) ?? 0} membros
                  </p>
                </div>
              ))}
              {(ministries ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Nenhuma área criada ainda.
                </p>
              )}
            </div>
          </section>

          <div className="border-t" />

          <section className="space-y-3" aria-labelledby="times-functions-title">
            <div>
              <p id="times-functions-title" className="font-medium">
                2. Times e funções
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Dentro de cada área, crie os times. Dentro de cada time, cadastre
                as funções que podem ser escaladas.
              </p>
            </div>
            <DepartmentsManager
              churchSlug={churchSlug}
              churchId={tenant.church.id}
              departments={departments ?? []}
              functions={teamFunctions ?? []}
              ministries={ministries ?? []}
            />
          </section>
        </CardContent>
      </Card>

      <DailyVerseSettings
        churchId={tenant.church.id}
        currentConfig={{
          daily_verse_enabled:
            notificationSettings.daily_verse_enabled === true,
          daily_verse_version:
            (notificationSettings.daily_verse_version as
              "blt" | "nvi" | "acf" | "ra" | undefined) ?? "blt",
          daily_verse_theme: notificationSettings.daily_verse_theme as
            string | undefined as
            | "auto"
            | "servir"
            | "encorajamento"
            | "descanso"
            | "gratidao"
            | "perseveranca"
            | "unidade"
            | undefined,
        }}
      />

      {isAdmin && (
        <DeleteChurchZone
          churchId={tenant.church.id}
          churchName={tenant.church.name}
        />
      )}
    </div>
  );
}
