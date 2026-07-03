import { apiFetch, parseErrorCode } from "./api";

function mockResponse(body: unknown, { json = true } = {}) {
  return {
    json: json
      ? () => Promise.resolve(body)
      : () => Promise.reject(new SyntaxError("Unexpected token")),
  } as Response;
}

describe("apiFetch", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("préfixe l'URL de l'API, envoie les credentials et un Content-Type JSON par défaut", async () => {
    const fetchMock = jest.fn().mockResolvedValue(mockResponse({}));
    global.fetch = fetchMock;

    await apiFetch("/clubs/1/teams");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/clubs/1/teams",
      expect.objectContaining({
        credentials: "include",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      }),
    );
  });

  it("laisse les headers explicites écraser le défaut (ex. Authorization)", async () => {
    const fetchMock = jest.fn().mockResolvedValue(mockResponse({}));
    global.fetch = fetchMock;

    await apiFetch("/clubs/1/teams", { headers: { Authorization: "Bearer x" } });

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers).toMatchObject({
      Authorization: "Bearer x",
      "Content-Type": "application/json",
    });
  });
});

describe("parseErrorCode", () => {
  it("renvoie le code JSON du corps de la réponse", async () => {
    const response = mockResponse({ code: "PLAYERS.NOT_FOUND" });

    await expect(parseErrorCode(response)).resolves.toBe("PLAYERS.NOT_FOUND");
  });

  it("retombe sur AUTH.UNKNOWN si le corps n'est pas du JSON valide", async () => {
    const response = mockResponse(null, { json: false });

    await expect(parseErrorCode(response)).resolves.toBe("AUTH.UNKNOWN");
  });

  it("retombe sur AUTH.UNKNOWN si le JSON ne contient pas de champ code", async () => {
    const response = mockResponse({ message: "oops" });

    await expect(parseErrorCode(response)).resolves.toBe("AUTH.UNKNOWN");
  });
});
