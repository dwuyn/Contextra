import { NextResponse } from "next/server";
import * as authService from "@/services/authService";

export async function POST(req: Request) {
  const { email, password } = (await req.json()) as {
    email?: string;
    password?: string;
  };

  try {
    await authService.login(email ?? "", password ?? "");
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === authService.INVALID_LOGIN_MESSAGE
    ) {
      return NextResponse.json({
        ok: false,
        message: authService.INVALID_LOGIN_MESSAGE,
      });
    }

    if (error instanceof Error) {
      return NextResponse.json(
        { ok: false, message: error.message },
        { status: 500 },
      );
    }

    throw error;
  }
}
