import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const session = request.cookies.get("session")?.value;

  const isAuthRoute = request.nextUrl.pathname.startsWith("/login") || request.nextUrl.pathname.startsWith("/register");
  const isPublicRoute = request.nextUrl.pathname === "/";

  if (!session && !isAuthRoute && !isPublicRoute) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  let refreshedSession: NextResponse | undefined;
  try {
    refreshedSession = await updateSession(request);
  } catch {
    const response = isPublicRoute
      ? NextResponse.next()
      : NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete("session");
    return response;
  }

  if (session && isAuthRoute) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return refreshedSession || NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icon.png).*)",
  ],
};
