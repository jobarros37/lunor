import { describe, expect, it, vi } from "vitest";
import {
  getInchurchOverview,
  InchurchApiError,
  listInchurchPeople,
} from "./inchurch-client";

const creds = { apiKey: "key-example", apiSecret: "secret-example" };

function page(count: number) {
  return new Response(JSON.stringify({ count, next: null, previous: null, results: [] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("inChurch read-only HTTP client", () => {
  it("usa Basic Auth, endpoint oficial, limite e no-store", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(page(12));
    const result = await listInchurchPeople(creds, { limit: 2, offset: 4 }, fetcher);
    expect(result.count).toBe(12);
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toBe("https://api.inchurch.com.br/public/v1/people/?limit=2&offset=4");
    expect(init?.method).toBe("GET");
    expect(init?.cache).toBe("no-store");
    const auth = (init?.headers as Record<string, string>).Authorization;
    expect(auth).toBe(`Basic ${btoa("key-example:secret-example")}`);
  });

  it("soma as contagens sem devolver dados de pessoas", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(page(128))
      .mockResolvedValueOnce(page(7));
    await expect(getInchurchOverview(creds, fetcher)).resolves.toEqual({
      peopleCount: 128, groupCount: 7,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("não repassa corpo de erro com dados pessoais", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValue(new Response('{"private":"do not expose"}', { status: 401 }));
    await expect(listInchurchPeople(creds, {}, fetcher))
      .rejects.toMatchObject({ status: 401, name: "InchurchApiError" });
  });

  it("distingue falta de escopo e rate limit", async () => {
    expect(new InchurchApiError(403).message).toContain("permissão");
    expect(new InchurchApiError(429).message).toContain("Limite");
  });

  it("rejeita respostas sem paginação válida", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValue(new Response('{"results":[]}', { status: 200 }));
    await expect(listInchurchPeople(creds, {}, fetcher))
      .rejects.toMatchObject({ status: 502 });
  });
});
