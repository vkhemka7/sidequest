import { createHash, createHmac, timingSafeEqual } from "crypto";

export const ACCESS_COOKIE_NAME = "sidequest-access";
export const ACCESS_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
export const MIN_ACCESS_TOKEN_LENGTH = 32;

export const MAX_BODY_BYTES = 256 * 1024;
export const MAX_MESSAGES = 80;
export const MAX_MESSAGE_CHARS = 32_000;
export const MAX_OUTPUT_TOKENS = 8_192;

export const CHAT_WINDOW_SECONDS = 10 * 60;
export const CHAT_IP_LIMIT = 12;
export const CHAT_GLOBAL_LIMIT = 60;
export const ACCESS_WINDOW_SECONDS = 10 * 60;
export const ACCESS_IP_LIMIT = 8;

export const chatUnavailableError = "Chat is unavailable.";
export const unauthorizedError = "Unauthorized.";
export const tooLargeError = "Request is too large.";
export const tooManyError = "Too many requests. Try again later.";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export type ChatGateResult =
  | { ok: true; messages: ChatMessage[]; persistence: unknown }
  | { ok: false; status: 400 | 401 | 413 | 429 | 503; error: string; retryAfter?: number };

const rateLimitTimeoutMs = 4_000;

type GuardOptions = {
  nowMs?: number;
  fetchImpl?: typeof fetch;
  rateLimitTimeoutMs?: number;
};

function accessToken(): string | null {
  const token = process.env.SIDEQUEST_ACCESS_TOKEN;
  if (typeof token !== "string" || token.length < MIN_ACCESS_TOKEN_LENGTH) return null;
  return token;
}

function safeEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  if (leftBytes.length !== rightBytes.length) {
    timingSafeEqual(leftBytes, leftBytes);
    return false;
  }
  return timingSafeEqual(leftBytes, rightBytes);
}

function redisRest() {
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const rawUrl = process.env.UPSTASH_REDIS_REST_URL;
  if (!token || token.length < 16 || !rawUrl) return null;

  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".upstash.io")) return null;
    return { token, pipelineUrl: `${url.origin}/pipeline` };
  } catch {
    return null;
  }
}

export function securityConfigurationError() {
  if (!accessToken() || !redisRest()) return chatUnavailableError;
  return null;
}

function readCookie(header: string | null, name: string) {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const item = part.trim();
    const separator = item.indexOf("=");
    if (separator === -1) continue;
    if (item.slice(0, separator) === name) return item.slice(separator + 1);
  }
  return undefined;
}

export function accessCookieValue(nowMs = Date.now()) {
  const token = accessToken();
  if (!token) throw new Error("Access token is not configured.");
  const expiresAt = Math.floor(nowMs / 1000) + ACCESS_COOKIE_MAX_AGE_SECONDS;
  const payload = `v1.${expiresAt}`;
  const mac = createHmac("sha256", token).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

export function accessCookieIsValid(value: string | undefined, nowMs = Date.now()) {
  const token = accessToken();
  if (!token || !value) return false;
  const [version, expiresAtText, mac, extra] = value.split(".");
  if (version !== "v1" || extra !== undefined || !expiresAtText || !mac) return false;
  if (!/^\d+$/.test(expiresAtText)) return false;
  const expiresAt = Number(expiresAtText);
  const nowSec = Math.floor(nowMs / 1000);
  if (expiresAt <= nowSec || expiresAt > nowSec + ACCESS_COOKIE_MAX_AGE_SECONDS) return false;
  const expected = createHmac("sha256", token).update(`v1.${expiresAtText}`).digest("base64url");
  return safeEqual(expected, mac);
}

export function presentedAccessTokenMatches(presented: unknown) {
  const token = accessToken();
  if (!token || typeof presented !== "string") return false;
  return safeEqual(presented, token);
}

// Vercel overwrites these headers. A client-supplied x-forwarded-for is not used.
export function rateLimitIdentity(request: Request) {
  const vercelIp = firstIp(request.headers.get("x-vercel-forwarded-for"));
  const realIp = firstIp(request.headers.get("x-real-ip"));
  const ip = vercelIp || realIp;
  if (ip) {
    return createHash("sha256").update(`sidequest-rate:${ip}`).digest("hex");
  }

  const host = new URL(request.url).hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return "local";
  return null;
}

function firstIp(header: string | null) {
  if (!header) return null;
  const ip = header.split(",")[0]?.trim() ?? "";
  if (!ip || ip.length > 128 || /[\s;]/.test(ip)) return null;
  return ip;
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<ChatMessage>;
  return (
    typeof message.id === "string" &&
    message.id.length > 0 &&
    message.id.length <= 80 &&
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string" &&
    message.content.trim().length > 0
  );
}

export async function readBodyText(request: Request, maxBytes: number) {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
    return null;
  }
  if (!request.body) {
    const text = await request.text();
    return byteLength(text) > maxBytes ? null : text;
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

function byteLength(text: string) {
  return new TextEncoder().encode(text).byteLength;
}

async function consumeWindow(
  namespace: string,
  identity: string,
  limit: number,
  windowSeconds: number,
  nowMs: number,
  fetchImpl: typeof fetch,
  timeoutMs: number,
) {
  const redis = redisRest();
  const nowSec = Math.floor(nowMs / 1000);
  const retryAfter = windowSeconds - (nowSec % windowSeconds);
  if (!redis) return { status: "unavailable" as const, retryAfter };

  const windowId = Math.floor(nowSec / windowSeconds);
  const key = `sq:${namespace}:${identity}:${windowId}`;
  let response: Response;
  try {
    response = await fetchImpl(redis.pipelineUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${redis.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["SET", key, "0", "EX", String(windowSeconds + 30), "NX"],
        ["INCR", key],
      ]),
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { status: "unavailable" as const, retryAfter };
  }

  if (!response.ok) return { status: "unavailable" as const, retryAfter };
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { status: "unavailable" as const, retryAfter };
  }
  const count = pipelineCount(payload);
  if (count === null) return { status: "unavailable" as const, retryAfter };
  if (count > limit) return { status: "limited" as const, retryAfter };
  return { status: "ok" as const, retryAfter };
}

function pipelineCount(payload: unknown) {
  if (!Array.isArray(payload)) return null;
  const increment = payload[1];
  if (!increment || typeof increment !== "object" || !("result" in increment)) return null;
  const count = increment.result;
  return typeof count === "number" && Number.isFinite(count) ? count : null;
}

function limitedResult(retryAfter: number): ChatGateResult {
  return { ok: false, status: 429, error: tooManyError, retryAfter };
}

export async function guardChatRequest(
  request: Request,
  options: GuardOptions = {},
): Promise<ChatGateResult> {
  if (securityConfigurationError()) {
    console.error("Chat security configuration is missing or invalid.");
    return { ok: false, status: 503, error: chatUnavailableError };
  }

  const nowMs = options.nowMs ?? Date.now();
  const fetchImpl = options.fetchImpl ?? fetch;
  const bodyText = await readBodyText(request, MAX_BODY_BYTES);
  if (bodyText === null) return { ok: false, status: 413, error: tooLargeError };

  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return { ok: false, status: 400, error: "Request must include at least one message." };
  }

  const messages = (body as { messages?: unknown }).messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, status: 400, error: "Request must include at least one message." };
  }
  if (messages.length > MAX_MESSAGES || messages.some((message) => {
    return isChatMessage(message) && message.content.length > MAX_MESSAGE_CHARS;
  })) {
    return { ok: false, status: 413, error: tooLargeError };
  }
  if (!messages.every(isChatMessage)) {
    return { ok: false, status: 400, error: "Messages must include id, role, and content." };
  }

  const cookie = readCookie(request.headers.get("cookie"), ACCESS_COOKIE_NAME);
  if (!accessCookieIsValid(cookie, nowMs)) {
    return { ok: false, status: 401, error: unauthorizedError };
  }

  const identity = rateLimitIdentity(request);
  if (!identity) {
    console.error("Chat request has no trusted client IP.");
    return { ok: false, status: 503, error: chatUnavailableError };
  }

  const ipLimit = await consumeWindow(
    "chat-ip",
    identity,
    CHAT_IP_LIMIT,
    CHAT_WINDOW_SECONDS,
    nowMs,
    fetchImpl,
    options.rateLimitTimeoutMs ?? rateLimitTimeoutMs,
  );
  if (ipLimit.status === "unavailable") {
    console.error("Chat rate limit store is unavailable.");
    return { ok: false, status: 503, error: chatUnavailableError };
  }
  if (ipLimit.status === "limited") return limitedResult(ipLimit.retryAfter);

  const globalLimit = await consumeWindow(
    "chat-global",
    "all",
    CHAT_GLOBAL_LIMIT,
    CHAT_WINDOW_SECONDS,
    nowMs,
    fetchImpl,
    options.rateLimitTimeoutMs ?? rateLimitTimeoutMs,
  );
  if (globalLimit.status === "unavailable") {
    console.error("Chat rate limit store is unavailable.");
    return { ok: false, status: 503, error: chatUnavailableError };
  }
  if (globalLimit.status === "limited") return limitedResult(globalLimit.retryAfter);

  return {
    ok: true,
    messages,
    persistence: (body as { persistence?: unknown }).persistence,
  };
}

export async function guardAccessAttempt(request: Request, options: GuardOptions = {}) {
  if (securityConfigurationError()) {
    console.error("Chat security configuration is missing or invalid.");
    return { ok: false as const, status: 503 as const, error: chatUnavailableError };
  }

  const identity = rateLimitIdentity(request);
  if (!identity) {
    console.error("Access attempt has no trusted client IP.");
    return { ok: false as const, status: 503 as const, error: chatUnavailableError };
  }

  const limit = await consumeWindow(
    "access-ip",
    identity,
    ACCESS_IP_LIMIT,
    ACCESS_WINDOW_SECONDS,
    options.nowMs ?? Date.now(),
    options.fetchImpl ?? fetch,
    options.rateLimitTimeoutMs ?? rateLimitTimeoutMs,
  );
  if (limit.status === "unavailable") {
    console.error("Access rate limit store is unavailable.");
    return { ok: false as const, status: 503 as const, error: chatUnavailableError };
  }
  if (limit.status === "limited") {
    return { ok: false as const, status: 429 as const, error: tooManyError, retryAfter: limit.retryAfter };
  }
  return { ok: true as const };
}
