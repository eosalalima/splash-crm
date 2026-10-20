import { getAuth, authConfigured } from "@/lib/auth/server";
import type { NextRequest } from "next/server";
type Context = { params: Promise<{ path: string[] }> };
export async function GET(request: NextRequest, context: Context) {
  if (!authConfigured())
    return Response.json(
      { message: "Neon Auth is not configured." },
      { status: 503 },
    );
  return getAuth().handler().GET(request, context);
}
export async function POST(request: NextRequest, context: Context) {
  if (!authConfigured())
    return Response.json(
      { message: "Neon Auth is not configured." },
      { status: 503 },
    );
  return getAuth().handler().POST(request, context);
}
