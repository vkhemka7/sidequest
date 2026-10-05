import { cookies } from "next/headers";

const cookieName = "sidequest-browser-owner";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function getBrowserOwner() {
  const cookieStore = await cookies();
  const existing = cookieStore.get(cookieName)?.value;
  if (existing && uuidPattern.test(existing)) return existing;

  const ownerId = crypto.randomUUID();
  cookieStore.set(cookieName, ownerId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return ownerId;
}
