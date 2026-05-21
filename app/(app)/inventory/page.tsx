import { prisma } from "@/lib/db";
import { requireFamilyId } from "@/lib/auth-helper";
import { InventoryClient } from "@/components/inventory/inventory-client";

export default async function InventoryPage() {
  const familyId = await requireFamilyId();
  const [items, ingredients] = await Promise.all([
    prisma.inventory.findMany({
      where: { familyId },
      include: { ingredient: true },
      orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }],
    }),
    prisma.ingredient.findMany({
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
  ]);

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6">
      <InventoryClient items={items} ingredients={ingredients} />
    </div>
  );
}
