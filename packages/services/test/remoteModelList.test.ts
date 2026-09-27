import assert from "node:assert/strict";
import test from "node:test";
import type { ProviderConfigObject } from "@nex/provider";
import {
  buildRemoteModelListRequest,
  fetchRemoteModelList,
  parseRemoteModelIds,
} from "../src/model-provider/remoteModelList.js";

function providerConfig(overrides: {
  type?: "anthropic-messages" | "openai-chat-completions";
  baseUrl?: string;
  headers?: Record<string, string>;
  apiKey?: string;
}): ProviderConfigObject {
  return {
    api: {
      type: overrides.type ?? "openai-chat-completions",
      baseUrl: overrides.baseUrl ?? "https://api.example.com/v1/",
      ...(overrides.headers ? { headers: overrides.headers } : {}),
    },
    access: { type: "api-key", apiKey: overrides.apiKey ?? "sk-test" },
  } as ProviderConfigObject;
}

test("parseRemoteModelIds handles OpenAI, Gemini and bare-array payloads", () => {
  assert.deepEqual(parseRemoteModelIds({ data: [{ id: "gpt-5.4" }, { id: "gpt-5.4" }] }), [
    "gpt-5.4",
  ]);
  assert.deepEqual(
    parseRemoteModelIds({ models: [{ name: "models/gemini-3-pro" }, { name: "  " }] }),
    ["gemini-3-pro"],
  );
  assert.deepEqual(parseRemoteModelIds(["a", { id: "b" }, 42, null]), ["a", "b"]);
  assert.deepEqual(parseRemoteModelIds("not json object"), []);
});

test("buildRemoteModelListRequest uses bearer auth and trims trailing slashes", () => {
  const { url, headers } = buildRemoteModelListRequest(providerConfig({}));
  assert.equal(url, "https://api.example.com/v1/models");
  assert.equal(headers.get("authorization"), "Bearer sk-test");
  assert.equal(headers.get("accept"), "application/json");
});

test("buildRemoteModelListRequest uses Anthropic headers for anthropic-messages", () => {
  const { headers } = buildRemoteModelListRequest(providerConfig({ type: "anthropic-messages" }));
  assert.equal(headers.get("x-api-key"), "sk-test");
  assert.equal(headers.get("anthropic-version"), "2023-06-01");
  assert.equal(headers.has("authorization"), false);
});

test("buildRemoteModelListRequest never overrides user headers, regardless of case", () => {
  const { headers } = buildRemoteModelListRequest(
    providerConfig({ headers: { Authorization: "Custom token" } }),
  );
  assert.equal(headers.get("authorization"), "Custom token");
});

test("buildRemoteModelListRequest rejects a provider without base URL", () => {
  assert.throws(() => buildRemoteModelListRequest(providerConfig({ baseUrl: "  " })));
});

test("fetchRemoteModelList surfaces HTTP failures", async () => {
  const request = (async () => new Response("nope", { status: 401 })) as typeof fetch;
  await assert.rejects(fetchRemoteModelList(providerConfig({}), request), /HTTP 401/);
});
