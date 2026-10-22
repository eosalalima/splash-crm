import "server-only";
import { createNeonAuth } from "@neondatabase/auth/next/server";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { headers } from "next/headers";
import { readSession } from "./read-session";
export const authConfigured = () =>
  Boolean(
    process.env.NEON_AUTH_BASE_URL &&
    process.env.NEON_AUTH_COOKIE_SECRET &&
    process.env.NEON_AUTH_COOKIE_SECRET.length >= 32,
  );
export function getAuth() {
  if (!authConfigured())
    throw new Error("Neon Auth is not configured. See README.md.");
  return createNeonAuth({
    baseUrl: process.env.NEON_AUTH_BASE_URL!,
    cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET! },
  });
}
export async function currentUser() {
  await connection();
  if (!authConfigured()) return null;
  const { data, error } = await readSession(
    process.env.NEON_AUTH_BASE_URL!,
    process.env.NEON_AUTH_COOKIE_SECRET!,
    await headers(),
  );
  if (error)
    throw new Error("Unable to verify your session. Please try again.");
  return data?.user ?? null;
}
export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}
