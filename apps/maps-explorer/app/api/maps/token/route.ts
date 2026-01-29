import { NextResponse } from "next/server";
import { getMapsAccessToken } from "@/app/lib/auth/token";

export async function GET() {
  try {
    const token = await getMapsAccessToken();
    return NextResponse.json({ token });
  } catch (error) {
    const message = error instanceof Error ? error.message : "token_error";
    return NextResponse.json({ message }, { status: 500 });
  }
}
