import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppNav } from "@/components/app-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  return (
    <div className="min-h-screen flex flex-col">
      <AppNav userName={session.user.name} />
      <main className="flex-1 pb-20 md:pb-0">{children}</main>
    </div>
  );
}
