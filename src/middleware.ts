import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { authSecret } from "@/lib/auth-secret";

/** Edge guard: anything under /app requires a valid session cookie. */
export async function middleware(req: NextRequest) {
  const token = req.cookies.get("zcrm_session")?.value;
  if (token) {
    try {
      await jwtVerify(token, authSecret());
      return NextResponse.next();
    } catch {
      /* fall through */
    }
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/app/:path*"] };
