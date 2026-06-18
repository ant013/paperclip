import { beforeEach, describe, expect, it, vi } from "vitest";

// Shared mock state for the two services the handler depends on. Hoisted so the
// vi.mock factories below can reference it (vi.mock is hoisted above imports).
const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  getById: vi.fn(),
  secretGetById: vi.fn(),
  resolveSecretValue: vi.fn(),
}));

vi.mock("../services/plugin-registry.js", () => ({
  pluginRegistryService: () => ({
    getById: mocks.getById,
    getConfig: mocks.getConfig,
  }),
}));

vi.mock("../services/secrets.js", () => ({
  secretService: () => ({
    getById: mocks.secretGetById,
    resolveSecretValue: mocks.resolveSecretValue,
  }),
}));

import { createPluginSecretsHandler } from "../services/plugin-secrets-handler.js";

const PLUGIN_ID = "11111111-1111-4111-8111-111111111111";
const ALLOWED_REF = "77777777-7777-4777-8777-777777777777";
const OTHER_REF = "88888888-8888-4888-8888-888888888888";

function makeHandler() {
  return createPluginSecretsHandler({ db: {} as never, pluginId: PLUGIN_ID });
}

describe("createPluginSecretsHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Plugin config references ALLOWED_REF. With no instanceConfigSchema the
    // extractor falls back to collecting all UUID-shaped values.
    mocks.getConfig.mockResolvedValue({ configJson: { telegramBotTokenRef: ALLOWED_REF } });
    mocks.getById.mockResolvedValue({ manifestJson: {} });
    mocks.secretGetById.mockResolvedValue({ companyId: "company-1" });
    mocks.resolveSecretValue.mockResolvedValue("resolved-token-value");
  });

  it("resolves a secret ref that the plugin's own config authorises", async () => {
    const handler = makeHandler();

    await expect(handler.resolve({ secretRef: ALLOWED_REF })).resolves.toBe("resolved-token-value");
    // Company scope comes from the secret itself; latest version is resolved.
    expect(mocks.resolveSecretValue).toHaveBeenCalledWith("company-1", ALLOWED_REF, "latest");
  });

  it("rejects a well-formed ref that is not present in the plugin config", async () => {
    const handler = makeHandler();

    await expect(handler.resolve({ secretRef: OTHER_REF })).rejects.toThrow(/secret not found/i);
    expect(mocks.resolveSecretValue).not.toHaveBeenCalled();
  });

  it("rejects malformed secret refs before any config or secret lookup", async () => {
    const handler = makeHandler();

    await expect(handler.resolve({ secretRef: "not-a-uuid" })).rejects.toThrow(
      /invalid secret reference/i,
    );
    expect(mocks.getConfig).not.toHaveBeenCalled();
    expect(mocks.secretGetById).not.toHaveBeenCalled();
  });

  it("surfaces not-found when an authorised ref no longer maps to a secret", async () => {
    mocks.secretGetById.mockResolvedValue(null);
    const handler = makeHandler();

    await expect(handler.resolve({ secretRef: ALLOWED_REF })).rejects.toThrow(/secret not found/i);
    expect(mocks.resolveSecretValue).not.toHaveBeenCalled();
  });
});
