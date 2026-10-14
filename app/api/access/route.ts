import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ACCESS_COOKIE_MAX_AGE_SECONDS,
  ACCESS_COOKIE_NAME,
  accessCookieIsValid,
  accessCookieValue,
  chatUnavailableError,
  guardAccessAttempt,
  presentedAccessTokenMatches,
  readBodyText,
  securityConfigurationError,
  unauthorizedError,
} from "@/lib/chat-security";

const accessBodyBytes = 4 * 1024;

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ACCESS_COOKIE_MAX_AGE_SECONDS,
  };
}

export async function GET() {
  if (securityConfigurationError()) {
    return NextResponse.json({ error: chatUnavailableError }, { status: 503 });
  }
  const cookieStore = await cookies();
  return NextResponse.json({
    authorized: accessCookieIsValid(cookieStore.get(ACCESS_COOKIE_NAME)?.value),
  });
}

export async function POST(request: Request) {
  const gate = await guardAccessAttempt(request);
  if (!gate.ok) {
    const headers = new Headers();
    if (gate.retryAfter) headers.set("Retry-After", String(gate.retryAfter));
    return NextResponse.json({ error: gate.error }, { status: gate.status, headers });
  }

  const bodyText = await readBodyText(request, accessBodyBytes);
  if (bodyText === null) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }

  let presented: unknown;
  try {
    presented = (JSON.parse(bodyText) as { token?: unknown }).token;
  } catch {
    return NextResponse.json({ error: unauthorizedError }, { status: 401 });
  }

  if (!presentedAccessTokenMatches(presented)) {
    return NextResponse.json({ error: unauthorizedError }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set(ACCESS_COOKIE_NAME, accessCookieValue(), cookieOptions());
  return NextResponse.json({ authorized: true });
}
