import { PrismaClient } from "@prisma/client";
import { getAIProvider } from "../lib/ai/provider";

const prisma = new PrismaClient();

async function main() {
  const dishes = await prisma.dish.findMany({
    where: { recipe: null },
    select: { id: true, name: true, servings: true },
    orderBy: { name: "asc" },
  });

  const total = dishes.length;
  console.log(`[bulk-fill] 待补菜谱 ${total} 道，开始...`);
  const provider = getAIProvider();

  let okCount = 0;
  let failCount = 0;
  const failures: { name: string; reason: string }[] = [];
  const t0 = Date.now();

  for (let i = 0; i < dishes.length; i++) {
    const d = dishes[i];
    const idx = i + 1;
    const t1 = Date.now();
    try {
      const generated = await provider.generateRecipe({
        dishName: d.name,
        servings: d.servings || 2,
        availableSeasonings: [],
        noSpicy: false,
        lowOilSalt: false,
      });

      await prisma.dish.update({
        where: { id: d.id },
        data: {
          cuisine: generated.cuisine,
          difficulty: generated.difficulty,
          totalMinutes: generated.totalMinutes,
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

      okCount++;
      const dt = ((Date.now() - t1) / 1000).toFixed(1);
      console.log(`[${idx}/${total}] ${d.name} ... ok ${dt}s (累计 ok=${okCount} fail=${failCount})`);
    } catch (e) {
      failCount++;
      const reason = e instanceof Error ? e.message : String(e);
      failures.push({ name: d.name, reason });
      const dt = ((Date.now() - t1) / 1000).toFixed(1);
      console.log(`[${idx}/${total}] ${d.name} ... FAIL ${dt}s: ${reason.substring(0, 80)}`);
    }
  }

  const totalSec = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`\n[bulk-fill] 完成。总耗时 ${totalSec}s，ok=${okCount} fail=${failCount}`);
  if (failures.length > 0) {
    console.log(`\n失败清单（可重跑本脚本重试）：`);
    for (const f of failures) {
      console.log(`  - ${f.name}: ${f.reason.substring(0, 100)}`);
    }
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("[bulk-fill] 致命错误:", e);
  await prisma.$disconnect();
  process.exit(1);
});
