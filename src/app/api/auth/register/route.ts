import { NextResponse } from "next/server";
import * as authService from "@/services/authService";

export async function POST(req: Request) {
  const { name, email, password } = (await req.json()) as {
    name?: string;
    email?: string;
    password?: string;
  };

  try {
    await authService.register(name ?? "", email ?? "", password ?? "");
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({
        ok: false,
        message: error.message,
      });
    }

    throw error;
  }
}
