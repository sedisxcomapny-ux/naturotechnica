import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PLACEHOLDER_URL = "your_url_here";
const PLACEHOLDER_KEY = "your_anon_key_here";

export async function middleware(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If Supabase isn't configured yet, don't gate anything — let the dev work
  // on the UI. Login calls will surface their own errors.
  if (!url || !anon || url === PLACEHOLDER_URL || anon === PLACEHOLDER_KEY) {
    return NextResponse.next();
  }

  const res = NextResponse.next();
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value, options }) => {
          res.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = req.nextUrl.pathname;
  const isLogin = pathname.startsWith("/login");
  const isAuthCallback = pathname.startsWith("/auth/callback");
  const isPublic = isLogin || isAuthCallback;

  if (!user && !isPublic) {
    const redirect = req.nextUrl.clone();
    redirect.pathname = "/login";
    return NextResponse.redirect(redirect);
  }

  if (user && isLogin) {
    const redirect = req.nextUrl.clone();
    redirect.pathname = "/";
    return NextResponse.redirect(redirect);
  }

  return res;
}

export const config = {
  matcher: [
    // Everything except Next internals and common static assets
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
