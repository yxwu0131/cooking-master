import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth-helper";
import { Button } from "@/components/ui/button";
import { DishImageManager } from "@/components/dishes/dish-image-manager";

export default async function DishImagesPage() {
  await requireUser();
  const dishes = await prisma.dish.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      cuisine: true,
      isSoup: true,
      isVegetarian: true,
      imageUrl: true,
    },
  });

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6 space-y-5">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/dishes">
          <ChevronLeft className="size-4" />
          返回菜品库
        </Link>
      </Button>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">菜品配图</h1>
        <p className="text-sm text-muted-foreground">
          给菜换一张更准的成品图，或上传自家照片。点「换图」从网上搜候选，点中即用。
        </p>
      </div>
      <DishImageManager dishes={dishes} />
    </div>
  );
}
