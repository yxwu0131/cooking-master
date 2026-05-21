import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireFamilyId, requireUser } from "@/lib/auth-helper";
import { Button } from "@/components/ui/button";
import { SessionWorkspace } from "@/components/cook/session-workspace";

export default async function CookSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const familyId = await requireFamilyId();
  const currentUser = await requireUser();

  const session = await prisma.mealSession.findFirst({
    where: { id, familyId },
    include: {
      chef: { select: { id: true, name: true, email: true } },
      requests: {
        include: { authorUser: true, member: true },
        orderBy: { createdAt: "asc" },
      },
      menus: {
        where: { status: { in: ["DRAFT", "EDITING", "CONFIRMED"] } },
        include: {
          dishes: { orderBy: { position: "asc" } },
          shoppingList: {
            include: {
              items: { orderBy: [{ area: "asc" }, { name: "asc" }] },
            },
          },
          cookingPlan: {
            include: { steps: { orderBy: { order: "asc" } } },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      feedbacks: true,
    },
  });
  if (!session) notFound();

  const [members, allDishes] = await Promise.all([
    prisma.familyMember.findMany({
      where: { familyId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.dish.findMany({
      select: {
        id: true,
        name: true,
        cuisine: true,
        difficulty: true,
        totalMinutes: true,
        isSpicy: true,
        isLight: true,
        isSoup: true,
        isStaple: true,
        isVegetarian: true,
        isChildFriendly: true,
      },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6 space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/cook">
          <ChevronLeft className="size-4" />
          返回做饭列表
        </Link>
      </Button>
      <SessionWorkspace
        session={session}
        members={members}
        currentUserId={currentUser.id}
        allDishes={allDishes}
      />
    </div>
  );
}
