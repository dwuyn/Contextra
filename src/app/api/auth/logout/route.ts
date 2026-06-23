import { NextResponse } from "next/server";
import * as authService from "@/services/authService";

export async function POST() {
  await authService.logout();
  return NextResponse.json({ ok: true });
}
