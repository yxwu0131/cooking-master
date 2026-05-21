import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateSessionForm } from "@/components/cook/create-session-form";
import { prisma } from "@/lib/db";
import { requireFamilyId, requireUser } from "@/lib/auth-helper";

export default async function NewCookPage() {
  const familyId = await requireFamilyId();
  const user = await requireUser();
  const [members, accounts] = await Promise.all([
    prisma.familyMember.findMany({
      where: { familyId },
      select: { id: true, name: true, isChild: true, isElder: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.findMany({
      where: { familyId },
      select: { id: true, name: true, email: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <div className="container mx-auto max-w-2xl px-4 py-6 space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/cook">
          <ChevronLeft className="size-4" />
          返回
        </Link>
      </Button>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">开始新一顿</h1>
        <p className="text-sm text-muted-foreground">
          告诉厨神今天的就餐条件，越详细推荐越准。
        </p>
      </div>
      <CreateSessionForm
        members={members}
        accounts={accounts}
        currentUserId={user.id}
      />
    </div>
  );
}
