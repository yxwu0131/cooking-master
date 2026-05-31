import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { DishRecipeView } from "@/components/dishes/dish-recipe-view";

type RecipeIngredient = {
  name: string;
  quantity: number;
  unit: string;
  optional?: boolean;
};

type RecipeStep = {
  order: number;
  action: string;
  durationMinutes: number;
  stepType?: string;
  heat?: string | null;
  cookware?: string | null;
  parallel?: boolean;
};

export default async function DishDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const dish = await prisma.dish.findUnique({
    where: { id },
    include: { recipe: true },
  });
  if (!dish) notFound();

  const recipe = dish.recipe;
  const ingredients = (recipe?.ingredients as RecipeIngredient[] | null) ?? [];
  const seasonings = (recipe?.seasonings as RecipeIngredient[] | null) ?? [];
  const steps = ((recipe?.steps as RecipeStep[] | null) ?? [])
    .slice()
    .sort((a, b) => a.order - b.order);

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6 space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/dishes">
          <ChevronLeft className="size-4" />
          返回菜品库
        </Link>
      </Button>

      <DishRecipeView
        dish={{
          id: dish.id,
          name: dish.name,
          imageUrl: dish.imageUrl,
          cuisine: dish.cuisine,
          difficulty: dish.difficulty,
          totalMinutes: dish.totalMinutes,
          servings: dish.servings,
          tags: dish.tags,
          isSpicy: dish.isSpicy,
          isLight: dish.isLight,
          isHearty: dish.isHearty,
          isSoup: dish.isSoup,
          isVegetarian: dish.isVegetarian,
          isChildFriendly: dish.isChildFriendly,
          mainIngredients: dish.mainIngredients,
          requiredCookware: dish.requiredCookware,
          recipe: recipe
            ? {
                ingredients,
                seasonings,
                steps,
                tips: recipe.tips,
                heatNotes: recipe.heatNotes,
              }
            : null,
        }}
      />
    </div>
  );
}
