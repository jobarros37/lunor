"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";

type Status = {
  ok: boolean;
  connected?: boolean;
  status?: string;
  lastCheckedAt?: string | null;
  peopleCount?: number;
  groupCount?: number;
  error?: string;
};

const endpoint = "/api/integrations/inchurch";

export function InchurchIntegration({ churchId }: { churchId: string }) {
  const [state, setState] = useState<Status | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`${endpoint}?churchId=${encodeURIComponent(churchId)}`, { cache: "no-store" })
      .then((response) => response.json() as Promise<Status>)
      .then((result) => { if (active) setState(result); })
      .catch(() => { if (active) setState({ ok: false, error: "Não foi possível consultar a integração." }); });
    return () => { active = false; };
  }, [churchId]);

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ churchId, apiKey: apiKey.trim(), apiSecret }),
      });
      const result = (await response.json()) as Status;
      if (!response.ok || !result.ok) throw Error(result.error ?? "Falha ao conectar.");
      setState({
        ...result, status: "connected", lastCheckedAt: new Date().toISOString(),
      });
      setApiKey("");
      setApiSecret("");
      toast.success("inChurch conectada. Permissões de leitura validadas.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao conectar.");
    } finally {
      setBusy(false);
    }
  }

  async function preview() {
    setBusy(true);
    try {
      const response = await fetch(
        `${endpoint}?churchId=${encodeURIComponent(churchId)}&preview=true`,
        { cache: "no-store" }
      );
      const result = (await response.json()) as Status;
      if (!response.ok || !result.ok) throw Error(result.error ?? "Consulta indisponível.");
      setState((previous) => ({ ...previous, ...result }));
      toast.success("Consulta realizada sem importar pessoas.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Consulta indisponível.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!window.confirm("Desconectar inChurch desta igreja? Nenhum dado do LUNOR será apagado.")) return;
    setBusy(true);
    try {
      const response = await fetch(endpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ churchId }),
      });
      const result = (await response.json()) as Status;
      if (!response.ok || !result.ok) throw Error(result.error ?? "Falha ao desconectar.");
      setState({ ok: true, connected: false });
      toast.success("Integração desconectada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao desconectar.");
    } finally {
      setBusy(false);
    }
  }

  const connected = state?.connected === true;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Integrações · inChurch</CardTitle>
        <CardDescription>
          Conecte a API oficial da inChurch para consultar pessoas e grupos.
          Nesta fase, nenhuma pessoa é importada nem alterada.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm" role="status" aria-live="polite">
          Estado: <strong>{state === null ? "Verificando…" : connected ? "Conectada" : "Desconectada"}</strong>
          {connected && state?.lastCheckedAt && (
            <span className="ml-2 text-muted-foreground">
              · Última validação: {new Date(state.lastCheckedAt).toLocaleString("pt-BR")}
            </span>
          )}
        </p>
        {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
        {connected && typeof state?.peopleCount === "number" && (
          <div className="grid gap-2 sm:grid-cols-2">
            <p className="rounded-lg border p-3 text-sm">Pessoas acessíveis: <strong>{state.peopleCount}</strong></p>
            <p className="rounded-lg border p-3 text-sm">Grupos acessíveis: <strong>{state.groupCount}</strong></p>
          </div>
        )}
        <form onSubmit={connect} className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            {connected ? "Para trocar a conexão, informe novas credenciais." :
              "Crie um cliente de API com escopos people:GET e group:GET na inChurch."}
          </p>
          <label className="grid gap-1 text-sm">
            API Key
            <Input value={apiKey} onChange={(event) => setApiKey(event.target.value)}
              autoComplete="off" maxLength={512} required />
          </label>
          <label className="grid gap-1 text-sm">
            API Secret
            <Input type="password" value={apiSecret} onChange={(event) => setApiSecret(event.target.value)}
              autoComplete="new-password" maxLength={2048} required />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || !apiKey.trim() || !apiSecret}>
              {busy ? "Processando…" : connected ? "Trocar credenciais" : "Testar e conectar"}
            </Button>
            {connected && (
              <>
                <Button type="button" variant="outline" onClick={preview} disabled={busy}>
                  Consultar contagens
                </Button>
                <Button type="button" variant="outline" onClick={disconnect} disabled={busy}>
                  Desconectar
                </Button>
              </>
            )}
          </div>
        </form>
        <a href="https://docs.inchurch.com.br/getting-started/authentication" target="_blank"
          rel="noopener noreferrer" className="text-sm underline underline-offset-4">
          Como criar um cliente de API na inChurch
        </a>
      </CardContent>
    </Card>
  );
}
