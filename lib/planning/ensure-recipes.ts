import { prisma } from "@/lib/db";
import { getAIProvider } from "@/lib/ai/provider";

/**
 * 确保菜单中所有菜品都有完整菜谱。
 * 没有菜谱的（通常是 AI 临时生成的新菜）调 AI 补全。
 * 失败的菜品会跳过，不阻塞主流程。
 */
export async function ensureRecipesForMenu(menuId: string) {
  const menu = await prisma.menu.findUnique({
    where: { id: menuId },
    include: {
      session: {
        include: {
          family: { include: { kitchen: true, preference: true } },
        },
      },
      dishes: {
        include: { dish: { include: { recipe: true } } },
      },
    },
  });
  if (!menu) return;

  const kitchen = menu.session.family.kitchen;
  const preference = menu.session.family.preference;
  const flags = (preference?.tasteFlags as Record<string, boolean>) ?? {};

  for (const md of menu.dishes) {
    if (md.dish.recipe) continue;

    try {
      const generated = await getAIProvider().generateRecipe({
        dishName: md.dish.name,
        servings: md.servings || 2,
        availableSeasonings: kitchen?.commonSeasonings ?? [],
        noSpicy: flags.noSpicy === true,
        lowOilSalt: flags.lowOilSalt === true,
      });

      await prisma.dish.update({
        where: { id: md.dish.id },
        data: {
          cuisine: generated.cuisine,
          difficulty: generated.difficulty,
          totalMinutes: generated.totalMinutes,
          servings: md.servings || 2,
          isSpicy: generated.isSpicy,
          isVegetarian: generated.isVegetarian,
          isSoup: generated.isSoup,
          requiredCookware: generated.requiredCookware,
          mainIngredients: generated.mainIngredients,
          recipe: {
            create: {
              ingredients: generated.ingredients,
              seasonings: generated.seasonings,
              steps: generated.steps,
              tips: generated.tips,
              heatNotes: generated.heatNotes ?? null,
            },
          },
        },
      });
    } catch (e) {
      console.error(`[ensureRecipes] 生成「${md.dish.name}」菜谱失败:`, e);
      // 跳过，不影响其他菜
    }
  }
}
