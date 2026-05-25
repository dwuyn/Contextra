import createMiddleware from "next-intl/middleware";
import { routing } from "@/lib/i18n-client";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/auth";

const intlMiddleware = createMiddleware(routing);

export async function proxy(request: NextRequest) {
  const response = await intlMiddleware(request);

  const session = request.cookies.get("session")?.value;
  const pathname = request.nextUrl.pathname;
  const dl = routing.defaultLocale;

  if (pathname.startsWith("/api/")) return response;

  const isLogin = pathname === `/${dl}/login` || pathname === "/login";
  const isRegister = pathname === `/${dl}/register` || pathname === "/register";
  const isAuth = isLogin || isRegister;
  const isPublic = pathname === "/" || pathname === `/${dl}` || pathname === `/${dl}/`;

  if (!session && !isAuth && !isPublic) {
    return NextResponse.redirect(new URL(`/${dl}/login`, request.url));
  }

  let refreshedSession: NextResponse | undefined;
  try {
    refreshedSession = await updateSession(request);
  } catch {
    const res = isPublic
      ? (response || NextResponse.next())
      : NextResponse.redirect(new URL(`/${dl}/login`, request.url));
    res.cookies.delete("session");
    return res;
  }

  if (session && isAuth) {
    return NextResponse.redirect(new URL(`/${dl}`, request.url));
  }

  return refreshedSession || response;
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
