import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      familyId: string | null;
      role: string;
    } & DefaultSession["user"];
  }

  interface User {
    familyId?: string | null;
    role?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    familyId: string | null;
    role: string;
  }
}
