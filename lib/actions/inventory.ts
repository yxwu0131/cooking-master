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
