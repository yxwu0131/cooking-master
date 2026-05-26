"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireFamilyId } from "@/lib/auth-helper";

const inventoryItemSchema = z.object({
  ingredientId: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1),
  location: z.enum(["REFRIGERATED", "FROZEN", "ROOM_TEMP"]).default("REFRIGERATED"),
  purchasedAt: z.coerce.date().optional().nullable(),
  expiresAt: z.coerce.date().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export type InventoryItemInput = z.infer<typeof inventoryItemSchema>;

export async function addInventoryItemAction(input: InventoryItemInput) {
  const familyId = await requireFamilyId();
  const parsed = inventoryItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "参数错误" };
  }

  // 如果未指定过期日，按食材默认保质期推算
  let expiresAt = parsed.data.expiresAt;
  if (!expiresAt) {
    const ing = await prisma.ingredient.findUnique({ where: { id: parsed.data.ingredientId } });
    if (ing?.defaultShelfLifeDays) {
      const purchaseDate = parsed.data.purchasedAt ?? new Date();
      expiresAt = new Date(purchaseDate);
      expiresAt.setDate(expiresAt.getDate() + ing.defaultShelfLifeDays);
    }
  }

  await prisma.inventory.create({
    data: {
      familyId,
      ingredientId: parsed.data.ingredientId,
      quantity: parsed.data.quantity,
      unit: parsed.data.unit,
      location: parsed.data.location,
      purchasedAt: parsed.data.purchasedAt ?? new Date(),
      expiresAt,
      notes: parsed.data.notes,
    },
  });
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  return { ok: true as const };
}

// 按食材名关键词粗猜分类 + 采购区（用户手动添加新食材时用）
function guessCategoryAndArea(name: string): {
  category: import("@prisma/client").IngredientCategory;
  shoppingArea: import("@prisma/client").ShoppingArea;
  unit: string;
} {
  const n = name;
  if (/牛|猪|羊|肉|排骨|里脊|五花|培根|香肠|腊肠|火腿/.test(n))
    return { category: "MEAT", shoppingArea: "MEAT", unit: "g" };
  if (/鸡|鸭|鹅|禽|翅|腿肉|鸡胸/.test(n))
    return { category: "POULTRY", shoppingArea: "MEAT", unit: "g" };
  if (/鱼|虾|蟹|贝|蛤|蚌|鱿鱼|墨鱼|章鱼|海参|扇贝|生蚝|蛏/.test(n))
    return { category: "SEAFOOD", shoppingArea: "SEAFOOD", unit: "g" };
  if (/蛋|奶|酸奶|黄油|奶酪|芝士/.test(n))
    return { category: "EGG_DAIRY", shoppingArea: "DAIRY", unit: "个" };
  if (/豆腐|豆干|豆皮|腐竹|豆浆|千张|素鸡|腐乳/.test(n))
    return { category: "SOY", shoppingArea: "SOY", unit: "块" };
  if (/米|面粉|面条|挂面|粉丝|粉条|年糕|馒头|包子|饺子|燕麦|藜麦|玉米面/.test(n))
    return { category: "GRAIN", shoppingArea: "GRAIN", unit: "g" };
  if (/木耳|银耳|香菇|花菇|干|紫菜|海带|腐竹|黄花菜|莲子|枸杞|红枣/.test(n))
    return { category: "DRY_GOODS", shoppingArea: "DRY_GOODS", unit: "g" };
  if (/盐|糖|酱油|醋|油|料酒|蚝油|味精|鸡精|淀粉|胡椒|花椒|八角|香叶|辣椒面|豆瓣|甜面酱|番茄酱/.test(n))
    return { category: "SEASONING", shoppingArea: "DRY_GOODS", unit: "g" };
  if (/苹果|香蕉|橙|梨|葡萄|西瓜|草莓|芒果|桃|柚|柠檬|蓝莓|火龙果|猕猴桃/.test(n))
    return { category: "FRUIT", shoppingArea: "VEGETABLE", unit: "个" };
  // 默认按蔬菜
  return { category: "VEGETABLE", shoppingArea: "VEGETABLE", unit: "g" };
}

const customItemSchema = z.object({
  name: z.string().trim().min(1, "请输入食材名").max(20, "名称过长"),
  quantity: z.coerce.number().positive("数量需大于 0"),
  unit: z.string().trim().min(1).max(8).optional(),
  location: z.enum(["REFRIGERATED", "FROZEN", "ROOM_TEMP"]).default("REFRIGERATED"),
});

export type CustomInventoryInput = z.input<typeof customItemSchema>;

/**
 * 手动添加新食材并入库：库里没有这个食材就当场创建（自动猜分类/采购区），
 * 已有（按名或别名）则直接复用。解决「只能从内置食材里选」的限制。
 */
export async function addCustomInventoryItemAction(input: CustomInventoryInput) {
  const familyId = await requireFamilyId();
  const parsed = customItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "参数错误" };
  }
  const name = parsed.data.name;

  // 先按名/别名找现有食材，避免重复创建
  let ingredient = await prisma.ingredient.findFirst({
    where: { OR: [{ name }, { aliases: { has: name } }] },
  });
  if (!ingredient) {
    const guess = guessCategoryAndArea(name);
    ingredient = await prisma.ingredient.create({
      data: {
        name,
        category: guess.category,
        shoppingArea: guess.shoppingArea,
        unit: parsed.data.unit ?? guess.unit,
      },
    });
  }

  await prisma.inventory.create({
    data: {
      familyId,
      ingredientId: ingredient.id,
      quantity: parsed.data.quantity,
      unit: parsed.data.unit ?? ingredient.unit,
      location: parsed.data.location,
      purchasedAt: new Date(),
      expiresAt: ingredient.defaultShelfLifeDays
        ? new Date(Date.now() + ingredient.defaultShelfLifeDays * 86400000)
        : undefined,
    },
  });

  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  return { ok: true as const, ingredientName: ingredient.name };
}

export async function updateInventoryItemAction(
  itemId: string,
  input: Partial<InventoryItemInput>
) {
  const familyId = await requireFamilyId();
  const existing = await prisma.inventory.findFirst({
    where: { id: itemId, familyId },
  });
  if (!existing) {
    return { ok: false as const, error: "库存项不存在" };
  }
  await prisma.inventory.update({
    where: { id: itemId },
    data: {
      quantity: input.quantity,
      unit: input.unit,
      location: input.location,
      expiresAt: input.expiresAt,
      notes: input.notes,
    },
  });
  revalidatePath("/inventory");
  return { ok: true as const };
}

export async function deleteInventoryItemAction(itemId: string) {
  const familyId = await requireFamilyId();
  const existing = await prisma.inventory.findFirst({
    where: { id: itemId, familyId },
  });
  if (!existing) {
    return { ok: false as const, error: "库存项不存在" };
  }
  await prisma.inventory.delete({ where: { id: itemId } });
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  return { ok: true as const };
}

export async function deleteInventoryItemsAction(itemIds: string[]) {
  const familyId = await requireFamilyId();
  if (itemIds.length === 0) return { ok: true as const, count: 0 };
  const result = await prisma.inventory.deleteMany({
    where: { id: { in: itemIds }, familyId },
  });
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  return { ok: true as const, count: result.count };
}

export async function clearAllInventoryAction() {
  const familyId = await requireFamilyId();
  const result = await prisma.inventory.deleteMany({ where: { familyId } });
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  return { ok: true as const, count: result.count };
}

// 批量添加时按 ingredient 类别给合理默认值（quantity=0 表示让服务端按类别推断）
function defaultQuantityFor(category: string, unit: string): number {
  switch (category) {
    case "MEAT":
    case "POULTRY":
    case "SEAFOOD":
      return unit === "g" ? 500 : 1; // 半斤
    case "GRAIN":
      return unit === "g" ? 1000 : 1; // 1kg 米/面
    case "VEGETABLE":
    case "FRUIT":
      return unit === "g" ? 300 : 1; // 1 个/颗/把
    case "EGG_DAIRY":
      return unit === "ml" ? 250 : unit === "g" ? 250 : 6; // 6 个鸡蛋 / 250ml 奶
    case "SOY":
      return unit === "g" ? 200 : 1;
    case "DRY_GOODS":
      return unit === "g" ? 100 : 1;
    case "SEASONING":
      return unit === "ml" || unit === "g" ? 50 : 1;
    default:
      return 1;
  }
}

export async function bulkAddInventoryAction(
  items: Array<{ ingredientId: string; quantity?: number; unit?: string }>
) {
  const familyId = await requireFamilyId();
  if (items.length === 0) return { ok: true as const };

  const catalog = await prisma.ingredient.findMany({
    where: { id: { in: items.map((i) => i.ingredientId) } },
  });
  const catMap = new Map(catalog.map((c) => [c.id, c]));

  await prisma.$transaction(
    items.map((item) => {
      const ing = catMap.get(item.ingredientId);
      const unit = item.unit ?? ing?.unit ?? "g";
      const quantity =
        item.quantity && item.quantity > 1
          ? item.quantity
          : defaultQuantityFor(ing?.category ?? "OTHER", unit);
      let expiresAt: Date | undefined;
      if (ing?.defaultShelfLifeDays) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + ing.defaultShelfLifeDays);
      }
      return prisma.inventory.create({
        data: {
          familyId,
          ingredientId: item.ingredientId,
          quantity,
          unit,
          location: "REFRIGERATED",
          purchasedAt: new Date(),
          expiresAt,
        },
      });
    })
  );
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  return { ok: true as const };
}
