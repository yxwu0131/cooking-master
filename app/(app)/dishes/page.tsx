import { prisma } from "@/lib/db";
import { requireFamilyId } from "@/lib/auth-helper";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DishesBrowse } from "@/components/dishes/dishes-browse";
import { WishesSection } from "@/components/dishes/wishes-section";

export default async function DishesPage() {
  const familyId = await requireFamilyId();
  const [dishes, wishes] = await Promise.all([
    prisma.dish.findMany({
      orderBy: [{ name: "asc" }],
      include: {
        familyDishes: {
          where: { familyId },
          select: { status: true, rating: true, cookCount: true },
        },
      },
    }),
    prisma.wish.findMany({
      where: { familyId },
      include: { parsedDish: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6">
      <div className="space-y-1 mb-6">
        <h1 className="text-2xl font-bold tracking-tight">菜品库</h1>
        <p className="text-sm text-muted-foreground">
          浏览菜品打标签，沉淀灵感为以后做饭做准备。
        </p>
      </div>

      <Tabs defaultValue="browse">
        <TabsList>
          <TabsTrigger value="browse">浏览菜品</TabsTrigger>
          <TabsTrigger value="wishes">灵感库（{wishes.length}）</TabsTrigger>
        </TabsList>
        <TabsContent value="browse" className="mt-6">
          <DishesBrowse dishes={dishes} />
        </TabsContent>
        <TabsContent value="wishes" className="mt-6">
          <WishesSection wishes={wishes} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
