/**
 * Cliente read-only da API pública inChurch.
 * Referência: https://docs.inchurch.com.br/openapi.json
 * Nunca execute este módulo no navegador e nunca registre credenciais ou PII em logs.
 */
export type InchurchCredentials = { apiKey: string; apiSecret: string };

export type InchurchPage<T> = {
  count: number | null;
  next: string | null;
  previous: string | null;
  results: T[];
};

export type InchurchPerson = {
  id: number;
  full_name: string;
  email?: string | null;
  church_id?: number | null;
  church_profile?: string | null;
  is_active?: boolean;
};

export type InchurchGroup = { id: number; name: string };

export class InchurchApiError extends Error {
  constructor(readonly status: number) {
    super(status === 401 ? "Credenciais da inChurch inválidas." :
      status === 403 ? "A chave não possui permissão para consultar pessoas e grupos." :
      status === 429 ? "Limite de chamadas da inChurch atingido. Tente novamente mais tarde." :
      status === 0 ? "Não foi possível acessar a API da inChurch." :
      "A API da inChurch retornou um erro.");
    this.name = "InchurchApiError";
  }
}

const BASE_URL = "https://api.inchurch.com.br/public/v1";

function basicAuth({ apiKey, apiSecret }: InchurchCredentials): string {
  const bytes = new TextEncoder().encode(`${apiKey}:${apiSecret}`);
  const encoded = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return `Basic ${btoa(encoded)}`;
}

async function getPage<T>(
  credentials: InchurchCredentials,
  path: "/people/" | "/group/",
  params: { limit: number; offset: number },
  fetcher: typeof fetch = fetch
): Promise<InchurchPage<T>> {
  const url = new URL(BASE_URL + path);
  url.searchParams.set("limit", String(Math.min(Math.max(params.limit, 1), 1000)));
  url.searchParams.set("offset", String(Math.max(0, params.offset)));

  let response: Response;
  try {
    response = await fetcher(url.toString(), {
      method: "GET",
      headers: {
        Authorization: basicAuth(credentials),
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new InchurchApiError(0);
  }

  if (!response.ok) throw new InchurchApiError(response.status);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new InchurchApiError(502);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new InchurchApiError(502);
  }
  const page = body as Record<string, unknown>;
  if (!(page.count === null || (typeof page.count === "number" && Number.isFinite(page.count))) ||
      !Array.isArray(page.results)) {
    throw new InchurchApiError(502);
  }
  return body as InchurchPage<T>;
}

export function listInchurchPeople(
  credentials: InchurchCredentials,
  options: { limit?: number; offset?: number } = {},
  fetcher?: typeof fetch
) {
  return getPage<InchurchPerson>(
    credentials, "/people/", { limit: options.limit ?? 50, offset: options.offset ?? 0 }, fetcher
  );
}

export function listInchurchGroups(
  credentials: InchurchCredentials,
  options: { limit?: number; offset?: number } = {},
  fetcher?: typeof fetch
) {
  return getPage<InchurchGroup>(
    credentials, "/group/", { limit: options.limit ?? 50, offset: options.offset ?? 0 }, fetcher
  );
}

/** Consulta somente contagens. Não persiste nem expõe informações pessoais. */
export async function getInchurchOverview(
  credentials: InchurchCredentials,
  fetcher?: typeof fetch
): Promise<{ peopleCount: number; groupCount: number }> {
  const [people, groups] = await Promise.all([
    listInchurchPeople(credentials, { limit: 1 }, fetcher),
    listInchurchGroups(credentials, { limit: 1 }, fetcher),
  ]);
  if (people.count === null || groups.count === null) throw new InchurchApiError(502);
  return { peopleCount: people.count, groupCount: groups.count };
}
