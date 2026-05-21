"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireFamilyId, requireUser } from "@/lib/auth-helper";
import { getAIProvider } from "@/lib/ai/provider";

const FAMILY_DISH_STATUSES = [
  "STAPLE",
  "LOVED",
  "KID_FAVORITE",
  "WANT_TO_TRY",
  "WEEKDAY",
  "WEEKEND",
  "LUNCH_BOX",
  "DISLIKED",
  "BLOCKED",
] as const;

const setStatusSchema = z.object({
  dishId: z.string().min(1),
  status: z.enum(FAMILY_DISH_STATUSES),
});

export async function setFamilyDishStatusAction(input: z.infer<typeof setStatusSchema>) {
  const familyId = await requireFamilyId();
  const parsed = setStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "参数错误" };
  }
  await prisma.familyDish.upsert({
    where: {
      familyId_dishId: {
        familyId,
        dishId: parsed.data.dishId,
      },
    },
    create: {
      familyId,
      dishId: parsed.data.dishId,
      status: parsed.data.status,
    },
    update: {
      status: parsed.data.status,
    },
  });
  revalidatePath("/dishes");
  return { ok: true as const };
}

export async function removeFamilyDishAction(dishId: string) {
  const familyId = await requireFamilyId();
  await prisma.familyDish.deleteMany({
    where: { familyId, dishId },
  });
  revalidatePath("/dishes");
  return { ok: true as const };
}

// ============================================================
// 灵感库
// ============================================================
const createWishSchema = z.object({
  raw: z.string().min(1, "请输入灵感内容").max(200),
  occasion: z.string().optional().nullable(),
  manualRecipe: z.string().max(4000).optional().nullable(),
});

export async function createWishAction(input: z.infer<typeof createWishSchema>) {
  const familyId = await requireFamilyId();
  const user = await requireUser();
  const parsed = createWishSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "参数错误" };
  }

  // 尝试通过名称匹配到现有菜品（简单包含匹配）
  const allDishes = await prisma.dish.findMany({
    select: { id: true, name: true },
  });
  const matched = allDishes.find((d) => parsed.data.raw.includes(d.name));

  await prisma.wish.create({
    data: {
      familyId,
      raw: parsed.data.raw,
      occasion: parsed.data.occasion,
      manualRecipe: parsed.data.manualRecipe ?? null,
      // 有手写做法时不直接套库存菜，意图是「我要让 AI 按我写的做法补全后入库」
      parsedDishId: parsed.data.manualRecipe ? null : matched?.id ?? null,
      status: parsed.data.manualRecipe ? "PENDING" : matched ? "PARSED" : "PENDING",
      createdById: user.id,
    },
  });
  revalidatePath("/dishes");
  revalidatePath("/dashboard");
  return { ok: true as const };
}

const updateWishSchema = z.object({
  wishId: z.string().min(1),
  manualRecipe: z.string().max(4000).optional().nullable(),
});

export async function updateWishAction(input: z.infer<typeof updateWishSchema>) {
  const familyId = await requireFamilyId();
  const parsed = updateWishSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "参数错误" };
  }
  const existing = await prisma.wish.findFirst({
    where: { id: parsed.data.wishId, familyId },
  });
  if (!existing) return { ok: false as const, error: "灵感不存在" };

  await prisma.wish.update({
    where: { id: parsed.data.wishId },
    data: { manualRecipe: parsed.data.manualRecipe ?? null },
  });
  revalidatePath("/dishes");
  return { ok: true as const };
}

/**
 * 用 AI 把 Wish 补全为完整菜品并入菜品库：
 * - 输入：wish.raw + wish.manualRecipe（可选）+ 家庭口味/调料约束
 * - AI 输出 dishName + 完整菜谱（同 RecipeGenerateOutput 结构）
 * - upsert Dish（同名复用），创建/更新 Recipe，关联 wish.parsedDishId 并 status=PARSED
 * - 自动加入 FamilyDish 为 WANT_TO_TRY（已有则保留状态）
 */
export async function parseWishToDishAction(wishId: string) {
  const familyId = await requireFamilyId();
  const wish = await prisma.wish.findFirst({
    where: { id: wishId, familyId },
  });
  if (!wish) return { ok: false as const, error: "灵感不存在" };

  // 拉家庭口味与调料以约束 AI 输出
  const [kitchen, preference] = await Promise.all([
    prisma.kitchenProfile.findUnique({ where: { familyId } }),
    prisma.familyPreference.findUnique({ where: { familyId } }),
  ]);
  const flags = (preference?.tasteFlags as Record<string, boolean>) ?? {};

  let generated;
  try {
    generated = await getAIProvider().wishToDish({
      rawWish: wish.raw,
      manualRecipe: wish.manualRecipe ?? null,
      servings: 2,
      availableSeasonings: kitchen?.commonSeasonings ?? [],
      noSpicy: flags.noSpicy === true,
      lowOilSalt: flags.lowOilSalt === true,
    });
  } catch (e) {
    console.error("[parseWishToDish] AI 调用失败:", e);
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "AI 解析失败，请稍后重试",
    };
  }

  const source = wish.manualRecipe ? "USER_INPUT" : "AI_GENERATED";

  // upsert Dish，菜名相同的复用现有记录
  const dish = await prisma.dish.upsert({
    where: { name: generated.dishName },
    create: {
      name: generated.dishName,
      cuisine: generated.cuisine,
      difficulty: generated.difficulty,
      totalMinutes: generated.totalMinutes,
      isSpicy: generated.isSpicy,
      isVegetarian: generated.isVegetarian,
      isSoup: generated.isSoup,
      requiredCookware: generated.requiredCookware,
      mainIngredients: generated.mainIngredients,
      source,
    },
    update: {
      cuisine: generated.cuisine,
      difficulty: generated.difficulty,
      totalMinutes: generated.totalMinutes,
      isSpicy: generated.isSpicy,
      isVegetarian: generated.isVegetarian,
      isSoup: generated.isSoup,
      requiredCookware: generated.requiredCookware,
      mainIngredients: generated.mainIngredients,
    },
  });

  // upsert Recipe（dishId 唯一）
  await prisma.recipe.upsert({
    where: { dishId: dish.id },
    create: {
      dishId: dish.id,
      ingredients: generated.ingredients,
      seasonings: generated.seasonings,
      steps: generated.steps,
      tips: generated.tips,
      heatNotes: generated.heatNotes ?? null,
    },
    update: {
      ingredients: generated.ingredients,
      seasonings: generated.seasonings,
      steps: generated.steps,
      tips: generated.tips,
      heatNotes: generated.heatNotes ?? null,
    },
  });

  // 自动加入「我家想做」
  await prisma.familyDish.upsert({
    where: { familyId_dishId: { familyId, dishId: dish.id } },
    create: { familyId, dishId: dish.id, status: "WANT_TO_TRY" },
    update: {},
  });

  // 更新 Wish 关联
  await prisma.wish.update({
    where: { id: wishId },
    data: { parsedDishId: dish.id, status: "PARSED" },
  });

  revalidatePath("/dishes");
  revalidatePath("/dashboard");
  return { ok: true as const, dishId: dish.id, dishName: dish.name };
}

export async function deleteWishAction(wishId: string) {
  const familyId = await requireFamilyId();
  await prisma.wish.deleteMany({
    where: { id: wishId, familyId },
  });
  revalidatePath("/dishes");
  revalidatePath("/dashboard");
  return { ok: true as const };
}

export async function markWishCookedAction(wishId: string) {
  const familyId = await requireFamilyId();
  await prisma.wish.updateMany({
    where: { id: wishId, familyId },
    data: { status: "COOKED" },
  });
  revalidatePath("/dishes");
  return { ok: true as const };
}

// ============================================================
// 菜品 / 菜谱编辑（厨师可视/可编辑入库后的做法）
// ============================================================
const recipeIngredientSchema = z.object({
  name: z.string().min(1),
  quantity: z.coerce.number().min(0),
  unit: z.string().min(1),
  optional: z.boolean().optional(),
});

const recipeStepSchema = z.object({
  order: z.coerce.number().int().min(1),
  action: z.string().min(1),
  durationMinutes: z.coerce.number().int().min(1).max(360),
  stepType: z
    .enum([
      "PREP",
      "MARINATE",
      "SOAK",
      "BLANCH",
      "BOIL",
      "STEAM",
      "STIR_FRY",
      "DEEP_FRY",
      "BRAISE",
      "REDUCE",
      "PLATE",
      "CLEAN",
    ])
    .optional(),
  heat: z.string().optional().nullable(),
  cookware: z.string().optional().nullable(),
  parallel: z.boolean().optional(),
});

const updateDishRecipeSchema = z.object({
  dishId: z.string().min(1),
  // 菜品基础字段
  cuisine: z.string().optional().nullable(),
  difficulty: z.coerce.number().int().min(1).max(5),
  totalMinutes: z.coerce.number().int().min(1).max(360),
  servings: z.coerce.number().int().min(1).max(20),
  isSpicy: z.boolean(),
  isLight: z.boolean(),
  isHearty: z.boolean(),
  isSoup: z.boolean(),
  isVegetarian: z.boolean(),
  isChildFriendly: z.boolean(),
  tags: z.array(z.string()).default([]),
  mainIngredients: z.array(z.string()).default([]),
  requiredCookware: z.array(z.string()).default([]),
  // 菜谱
  ingredients: z.array(recipeIngredientSchema).default([]),
  seasonings: z.array(recipeIngredientSchema).default([]),
  steps: z.array(recipeStepSchema).min(1, "至少 1 个步骤"),
  tips: z.array(z.string()).default([]),
  heatNotes: z.string().optional().nullable(),
});

export type UpdateDishRecipeInput = z.infer<typeof updateDishRecipeSchema>;

export async function updateDishRecipeAction(input: UpdateDishRecipeInput) {
  await requireFamilyId(); // 登录即可，菜品库目前全局共享
  const parsed = updateDishRecipeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "参数错误",
    };
  }

  const {
    dishId,
    cuisine,
    difficulty,
    totalMinutes,
    servings,
    isSpicy,
    isLight,
    isHearty,
    isSoup,
    isVegetarian,
    isChildFriendly,
    tags,
    mainIngredients,
    requiredCookware,
    ingredients,
    seasonings,
    steps,
    tips,
    heatNotes,
  } = parsed.data;

  // 规整步骤顺序：按用户给的 order 排序后重新发号 1..N
  const orderedSteps = [...steps]
    .sort((a, b) => a.order - b.order)
    .map((s, idx) => ({ ...s, order: idx + 1 }));

  const dish = await prisma.dish.findUnique({ where: { id: dishId } });
  if (!dish) return { ok: false as const, error: "菜品不存在" };

  await prisma.$transaction([
    prisma.dish.update({
      where: { id: dishId },
      data: {
        cuisine: cuisine ?? null,
        difficulty,
        totalMinutes,
        servings,
        isSpicy,
        isLight,
        isHearty,
        isSoup,
        isVegetarian,
        isChildFriendly,
        tags,
        mainIngredients,
        requiredCookware,
      },
    }),
    prisma.recipe.upsert({
      where: { dishId },
      create: {
        dishId,
        ingredients,
        seasonings,
        steps: orderedSteps,
        tips,
        heatNotes: heatNotes ?? null,
      },
      update: {
        ingredients,
        seasonings,
        steps: orderedSteps,
        tips,
        heatNotes: heatNotes ?? null,
      },
    }),
  ]);

  revalidatePath(`/dishes/${dishId}`);
  revalidatePath("/dishes");
  return { ok: true as const };
}
