import { prisma } from "@/lib/db";
import type { ShoppingArea } from "@prisma/client";

type RecipeIngredient = {
  name: string;
  quantity: number;
  unit: string;
  optional?: boolean;
};

type MissingFromMenu = {
  name: string;
  quantity: number;
  unit: string;
};

/**
 * 为已确认的菜单生成采购清单。
 * 算法：
 * 1. 汇总菜单中所有菜的食材（来自 Recipe.ingredients）
 * 2. 加上每道菜 AI 标注的 missingIngredients（兜底，防止 AI 推荐的菜没在菜谱库里）
 * 3. 同名食材合并数量
 * 4. 对照家庭库存和常备调料 → 标记 isHave
 * 5. 按 ShoppingArea 分组
 */
export async function generateShoppingListForMenu(menuId: string) {
  const menu = await prisma.menu.findUnique({
    where: { id: menuId },
    include: {
      dishes: {
        include: {
          dish: { include: { recipe: true } },
        },
      },
      session: true,
    },
  });
  if (!menu) throw new Error("菜单不存在");

  const familyId = menu.session.familyId;

  // 已有清单则删除重生成
  await prisma.shoppingList.deleteMany({ where: { menuId } });

  const [inventory, kitchen, ingredientCatalog] = await Promise.all([
    prisma.inventory.findMany({
      where: { familyId },
      include: { ingredient: true },
    }),
    prisma.kitchenProfile.findUnique({ where: { familyId } }),
    prisma.ingredient.findMany(),
  ]);

  const haveSet = new Set<string>();
  for (const item of inventory) {
    haveSet.add(item.ingredient.name);
    item.ingredient.aliases.forEach((a) => haveSet.add(a));
  }
  const commonSeasonings = new Set(kitchen?.commonSeasonings ?? []);

  // alias → canonical name 映射：用于把 AI 用的别名（生姜/大蒜/鸡翅中）统一到主名
  const aliasToCanonical = new Map<string, string>();
  for (const cat of ingredientCatalog) {
    aliasToCanonical.set(cat.name, cat.name);
    for (const a of cat.aliases) {
      aliasToCanonical.set(a, cat.name);
    }
  }

  function canonicalName(raw: string): string {
    return aliasToCanonical.get(raw) ?? raw;
  }
  // 常备调料也归一化，避免别名（生抽↔酱油、生粉↔淀粉）漏跳/错列（与下面 isHave 同口径）
  const commonSeasoningsCanon = new Set([...commonSeasonings].map(canonicalName));

  // 汇总
  type Aggregated = {
    name: string;
    quantity: number;
    unit: string;
    isOptional: boolean;
  };
  const map = new Map<string, Aggregated>();

  function add(rawName: string, qty: number, unit: string, optional = false) {
    const name = canonicalName(rawName);
    const key = `${name}::${unit}`;
    const existing = map.get(key);
    if (existing) {
      existing.quantity += qty;
      existing.isOptional = existing.isOptional && optional;
    } else {
      map.set(key, { name, quantity: qty, unit, isOptional: optional });
    }
  }

  for (const md of menu.dishes) {
    // 食材主料
    const recipeIngredients = (md.dish.recipe?.ingredients as RecipeIngredient[] | null) ?? [];
    const recipeSeasonings = (md.dish.recipe?.seasonings as RecipeIngredient[] | null) ?? [];
    const factor = md.servings / (md.dish.servings || 2);

    for (const ing of recipeIngredients) {
      add(ing.name, ing.quantity * factor, ing.unit, ing.optional ?? false);
    }
    // 调料：只列非常备的（原始名或归一化后命中常备都跳过）
    for (const s of recipeSeasonings) {
      if (commonSeasonings.has(s.name) || commonSeasoningsCanon.has(canonicalName(s.name))) continue;
      add(s.name, s.quantity * factor, s.unit, true);
    }

    // AI 标注的 missingIngredients 兜底
    const aiMissing = (md.missingIngredients as MissingFromMenu[] | null) ?? [];
    for (const m of aiMissing) {
      add(m.name, m.quantity * factor, m.unit, false);
    }
  }

  const list = await prisma.shoppingList.create({
    data: {
      menuId,
      items: {
        create: Array.from(map.values()).map((entry) => {
          const cat = ingredientCatalog.find(
            (c) => c.name === entry.name || c.aliases.includes(entry.name)
          );
          const isHave =
            haveSet.has(entry.name) ||
            commonSeasoningsCanon.has(entry.name) ||
            (cat?.aliases.some((a) => haveSet.has(a)) ?? false);
          return {
            ingredientId: cat?.id ?? null,
            name: entry.name,
            quantity: Math.ceil(entry.quantity * 10) / 10,
            unit: entry.unit,
            area: (cat?.shoppingArea ?? "OTHER") as ShoppingArea,
            isHave,
            isOptional: entry.isOptional,
          };
        }),
      },
    },
    include: { items: true },
  });

  return list;
}
