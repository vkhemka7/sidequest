import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const nodeRequire = createRequire(import.meta.url);
const accessToken = "a".repeat(32);
const redisToken = "redis-token-secret";
const envKeys = [
  "SIDEQUEST_ACCESS_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "OPENAI_API_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

function loadTs(file, extraRequire = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const cjsModule = { exports: {} };
  vm.runInNewContext(
    compiled,
    {
      module: cjsModule,
      exports: cjsModule.exports,
      require(name) {
        return extraRequire[name] ?? nodeRequire(name);
      },
      process,
      console,
      Buffer,
      URL,
      TextEncoder,
      TextDecoder,
      Headers,
      Request,
      Response,
      AbortSignal,
      fetch: (...args) => globalThis.fetch(...args),
      crypto: globalThis.crypto,
    },
    { filename: file },
  );
  return cjsModule.exports;
}

const security = loadTs("lib/chat-security.ts");
const openaiCalls = [];
class OpenAIMock {
  constructor() {
    openaiCalls.push("construct");
  }
  responses = {
    create: async (params) => {
      openaiCalls.push(params);
      return { id: "resp_test", output_text: "Hello from the model." };
    },
  };
}
const chatRoute = loadTs("app/api/chat/route.ts", {
  openai: { __esModule: true, default: OpenAIMock },
  "@/lib/chat-security": security,
  "@/lib/persistence": {
    startGeneration() {
      throw new Error("persistence should not run");
    },
    completeGeneration() {},
    failGeneration() {},
  },
  "@/lib/supabase-admin": { persistenceIsConfigured: () => false },
  "@/lib/browser-owner": {
    getBrowserOwner() {
      throw new Error("owner lookup should not run");
    },
  },
});

function saveEnv() {
  return Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
}

function restoreEnv(saved) {
  for (const key of envKeys) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
}

function useSecurityEnv() {
  process.env.SIDEQUEST_ACCESS_TOKEN = accessToken;
  process.env.UPSTASH_REDIS_REST_URL = "https://sidequest-test.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = redisToken;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
}

function messageBody(content = "Hello") {
  return { messages: [{ id: "message-1", role: "user", content }] };
}

function chatRequest({
  cookie,
  body = messageBody(),
  url = "https://sidequest.example/api/chat",
  headers = { "x-vercel-forwarded-for": "203.0.113.10" },
} = {}) {
  const requestHeaders = { "content-type": "application/json", ...headers };
  if (cookie) requestHeaders.cookie = `${security.ACCESS_COOKIE_NAME}=${cookie}`;
  return new Request(url, {
    method: "POST",
    headers: requestHeaders,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function redisFetch({ ipCount = 1, globalCount = 1, fail = false } = {}) {
  const calls = [];
  const impl = async (url, options) => {
    calls.push({ url, options });
    if (fail) return new Response("nope", { status: 500 });
    const key = JSON.parse(options.body)[1][1];
    const count = String(key).includes("chat-global") ? globalCount : ipCount;
    return Response.json([{ result: "OK" }, { result: count }]);
  };
  return { calls, impl };
}

test("chat fails closed without access-token or rate-limit configuration", async () => {
  const saved = saveEnv();
  const savedFetch = globalThis.fetch;
  try {
    delete process.env.SIDEQUEST_ACCESS_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const fetchCalls = [];
    globalThis.fetch = async (...args) => {
      fetchCalls.push(args);
      throw new Error("network");
    };
    openaiCalls.length = 0;

    const missingToken = await chatRoute.POST(chatRequest());
    assert.equal(missingToken.status, 503);
    const missingBody = await missingToken.json();
    assert.deepEqual(missingBody, { error: security.chatUnavailableError });
    assert.equal(JSON.stringify(missingBody).includes("SIDEQUEST"), false);

    process.env.SIDEQUEST_ACCESS_TOKEN = "too-short";
    const shortToken = await security.guardChatRequest(chatRequest(), { fetchImpl: globalThis.fetch });
    assert.equal(shortToken.status, 503);

    process.env.SIDEQUEST_ACCESS_TOKEN = accessToken;
    process.env.UPSTASH_REDIS_REST_URL = "http://sidequest-test.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = redisToken;
    const insecureRedis = await security.guardChatRequest(chatRequest());
    assert.equal(insecureRedis.status, 503);

    process.env.UPSTASH_REDIS_REST_URL = "https://example.com";
    const foreignRedis = await security.guardChatRequest(chatRequest());
    assert.equal(foreignRedis.status, 503);

    assert.equal(fetchCalls.length, 0);
    assert.equal(openaiCalls.length, 0);
  } finally {
    globalThis.fetch = savedFetch;
    restoreEnv(saved);
  }
});

test("unauthorized chat requests never reach OpenAI or the rate-limit store", async () => {
  const saved = saveEnv();
  const { calls, impl } = redisFetch();
  try {
    useSecurityEnv();
    openaiCalls.length = 0;
    const missing = await chatRoute.POST(chatRequest({ cookie: undefined }));
    assert.equal(missing.status, 401);
    const missingBody = await missing.json();
    assert.deepEqual(missingBody, { error: security.unauthorizedError });

    process.env.SIDEQUEST_ACCESS_TOKEN = `${accessToken}-other`;
    const foreignCookie = security.accessCookieValue();
    process.env.SIDEQUEST_ACCESS_TOKEN = accessToken;
    const forged = await security.guardChatRequest(
      chatRequest({ cookie: foreignCookie }),
      { fetchImpl: impl },
    );
    assert.equal(forged.status, 401);

    const expired = security.accessCookieValue(0);
    const stale = await security.guardChatRequest(
      chatRequest({ cookie: expired }),
      { nowMs: (security.ACCESS_COOKIE_MAX_AGE_SECONDS + 5) * 1000, fetchImpl: impl },
    );
    assert.equal(stale.status, 401);
    assert.equal(calls.length, 0);
    assert.equal(openaiCalls.length, 0);
    assert.equal(JSON.stringify(missingBody).includes(redisToken), false);
  } finally {
    restoreEnv(saved);
  }
});

test("chat rejects oversized bodies and message lists before spending a model call", async () => {
  const saved = saveEnv();
  const { calls, impl } = redisFetch();
  try {
    useSecurityEnv();
    openaiCalls.length = 0;
    const cookie = security.accessCookieValue();
    const header = await security.guardChatRequest(
      new Request("https://sidequest.example/api/chat", {
        method: "POST",
        headers: {
          "content-length": String(security.MAX_BODY_BYTES + 1),
          "x-vercel-forwarded-for": "203.0.113.10",
          cookie: `${security.ACCESS_COOKIE_NAME}=${cookie}`,
        },
        body: "{}",
      }),
      { fetchImpl: impl },
    );
    assert.equal(header.ok, false);
    assert.equal(header.status, 413);

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(security.MAX_BODY_BYTES + 1));
        controller.close();
      },
    });
    const streamed = await security.guardChatRequest(
      new Request("https://sidequest.example/api/chat", {
        method: "POST",
        body: stream,
        duplex: "half",
        headers: { "x-vercel-forwarded-for": "203.0.113.10", cookie: `${security.ACCESS_COOKIE_NAME}=${cookie}` },
      }),
      { fetchImpl: impl },
    );
    assert.equal(streamed.status, 413);

    const longMessage = await security.guardChatRequest(
      chatRequest({
        cookie,
        body: messageBody("x".repeat(security.MAX_MESSAGE_CHARS + 1)),
      }),
      { fetchImpl: impl },
    );
    assert.equal(longMessage.status, 413);

    const tooMany = await security.guardChatRequest(
      chatRequest({
        cookie,
        body: {
          messages: Array.from({ length: security.MAX_MESSAGES + 1 }, (_, index) => ({
            id: `message-${index}`,
            role: "user",
            content: "Hello",
          })),
        },
      }),
      { fetchImpl: impl },
    );
    assert.equal(tooMany.status, 413);
    assert.equal(calls.length, 0);
    assert.equal(openaiCalls.length, 0);
  } finally {
    restoreEnv(saved);
  }
});

test("authorized chat is rate limited and a passing request caps output tokens", async () => {
  const saved = saveEnv();
  const savedFetch = globalThis.fetch;
  try {
    useSecurityEnv();
    process.env.OPENAI_API_KEY = "sk-test-not-real";
    openaiCalls.length = 0;
    const cookie = security.accessCookieValue();
    const limitedFetch = redisFetch({ ipCount: security.CHAT_IP_LIMIT + 1 });
    globalThis.fetch = limitedFetch.impl;
    const limitedResponse = await chatRoute.POST(chatRequest({ cookie }));
    assert.equal(limitedResponse.status, 429);
    assert.equal(Number(limitedResponse.headers.get("retry-after")) > 0, true);
    assert.deepEqual(await limitedResponse.json(), { error: security.tooManyError });
    assert.equal(openaiCalls.length, 0);

    const globalFetch = redisFetch({ ipCount: 1, globalCount: security.CHAT_GLOBAL_LIMIT + 1 });
    const globalLimited = await security.guardChatRequest(chatRequest({ cookie }), {
      fetchImpl: globalFetch.impl,
    });
    assert.equal(globalLimited.status, 429);

    const down = await security.guardChatRequest(chatRequest({ cookie }), {
      fetchImpl: redisFetch({ fail: true }).impl,
    });
    assert.equal(down.status, 503);

    const hung = await security.guardChatRequest(chatRequest({ cookie }), {
      fetchImpl: (_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () => reject(options.signal.reason));
        }),
      rateLimitTimeoutMs: 30,
    });
    assert.equal(hung.status, 503);

    const untrusted = await security.guardChatRequest(
      chatRequest({ cookie, headers: { "x-forwarded-for": "198.51.100.20" } }),
      { fetchImpl: redisFetch().impl },
    );
    assert.equal(untrusted.status, 503);

    const allowedFetch = redisFetch();
    globalThis.fetch = allowedFetch.impl;
    const allowed = await chatRoute.POST(chatRequest({
      cookie,
      body: messageBody("Where do tangents go?"),
    }));
    assert.equal(allowed.status, 200);
    const payload = await allowed.json();
    assert.equal(payload.text, "Hello from the model.");
    assert.equal(typeof payload.messageId, "string");
    const completion = openaiCalls.at(-1);
    assert.equal(completion.max_output_tokens, security.MAX_OUTPUT_TOKENS);
    assert.equal(completion.input[0].content, "Where do tangents go?");
    assert.equal(JSON.stringify(completion).includes(accessToken), false);
    assert.equal(JSON.stringify(completion).includes(redisToken), false);
    const redisBody = allowedFetch.calls.map((call) => call.options.body).join("\n");
    assert.equal(redisBody.includes("Where do tangents go?"), false);
    assert.equal(redisBody.includes(accessToken), false);
    assert.equal(allowedFetch.calls[0].options.headers.Authorization, `Bearer ${redisToken}`);
    assert.equal(allowedFetch.calls[0].url, "https://sidequest-test.upstash.io/pipeline");
  } finally {
    globalThis.fetch = savedFetch;
    restoreEnv(saved);
  }
});

test("client code and access responses do not expose server secrets", async () => {
  const page = fs.readFileSync("app/page.tsx", "utf8");
  const route = fs.readFileSync("app/api/chat/route.ts", "utf8");
  assert.equal(page.includes("SIDEQUEST_ACCESS_TOKEN"), false);
  assert.equal(page.includes("UPSTASH_REDIS_REST"), false);
  assert.equal(page.includes("OPENAI_API_KEY"), false);
  assert.equal(route.includes("max_output_tokens: MAX_OUTPUT_TOKENS"), true);
  assert.equal(route.includes("guardChatRequest"), true);

  const saved = saveEnv();
  try {
    useSecurityEnv();
    assert.equal(security.presentedAccessTokenMatches(`${accessToken}nope`), false);
    assert.equal(security.presentedAccessTokenMatches(accessToken), true);
    const attempts = redisFetch({ ipCount: security.ACCESS_IP_LIMIT + 1 });
    const blocked = await security.guardAccessAttempt(
      new Request("https://sidequest.example/api/access", {
        method: "POST",
        headers: { "x-vercel-forwarded-for": "203.0.113.44" },
      }),
      { fetchImpl: attempts.impl },
    );
    assert.equal(blocked.status, 429);
    assert.equal(JSON.stringify(blocked).includes(accessToken), false);
  } finally {
    restoreEnv(saved);
  }
});
