import createMiddleware from "next-intl/middleware";
import { routing } from "@/lib/i18n-client";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/auth";

const intlMiddleware = createMiddleware(routing);

function applyCookies(target: NextResponse, source?: NextResponse) {
  if (!source) {
    return target;
  }

  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }

  return target;
}

export async function proxy(request: NextRequest) {
  const response = (await intlMiddleware(request)) ?? NextResponse.next();

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
  if (session) {
    let sessionUpdate;
    try {
      sessionUpdate = await updateSession(request);
    } catch {
      return response;
    }

    if (sessionUpdate.kind === "invalid" || sessionUpdate.kind === "missing") {
      const res = isPublic || isAuth
        ? response
        : NextResponse.redirect(new URL(`/${dl}/login`, request.url));
      res.cookies.delete("session");
      return res;
    }

    if (sessionUpdate.kind === "refreshed") {
      refreshedSession = sessionUpdate.response;
    }
  }

  if (refreshedSession && isAuth) {
    return applyCookies(
      NextResponse.redirect(new URL(`/${dl}`, request.url)),
      refreshedSession,
    );
  }

  return applyCookies(response, refreshedSession);
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
