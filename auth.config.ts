import type { NextAuthConfig } from "next-auth";

// Edge-safe 配置（middleware 用，不能 import Prisma 等 Node-only 模块）
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnApp =
        nextUrl.pathname.startsWith("/dashboard") ||
        nextUrl.pathname.startsWith("/family") ||
        nextUrl.pathname.startsWith("/dishes") ||
        nextUrl.pathname.startsWith("/inventory") ||
        nextUrl.pathname.startsWith("/cook") ||
        nextUrl.pathname.startsWith("/feedback");
      const isOnAuth =
        nextUrl.pathname.startsWith("/login") ||
        nextUrl.pathname.startsWith("/register");

      if (isOnApp) {
        return isLoggedIn;
      }
      if (isOnAuth && isLoggedIn) {
        return Response.redirect(new URL("/dashboard", nextUrl));
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.familyId = (user as { familyId?: string }).familyId ?? null;
        token.role = (user as { role?: string }).role ?? "MEMBER";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token) {
        session.user.id = token.id as string;
        session.user.familyId = (token.familyId as string | null) ?? null;
        session.user.role = (token.role as string) ?? "MEMBER";
      }
      return session;
    },
  },
  providers: [], // 真实 providers 在 auth.ts 注入（包含 Prisma，不 edge-safe）
  session: { strategy: "jwt" },
} satisfies NextAuthConfig;
