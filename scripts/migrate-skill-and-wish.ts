/**
 * 一次性数据迁移：
 *   1) FamilyMember 增加 cookingSkill / maxComplexity（拷贝原 KitchenProfile 的值到家庭管理员的成员档案）
 *   2) Wish 增加 manualRecipe
 *   3) KitchenProfile 删除 skillLevel / maxComplexity
 *
 * 用法（Windows + pnpm 11）：
 *   node node_modules/.pnpm/tsx@4.22.1/node_modules/tsx/dist/cli.mjs scripts/migrate-skill-and-wish.ts
 *
 * 跑完后再执行：
 *   node node_modules/prisma/build/index.js generate
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_name = $1 AND column_name = $2
     ) AS exists`,
    table,
    column
  );
  return rows[0]?.exists === true;
}

async function main() {
  console.log("=== migrate-skill-and-wish ===");

  // 1. 添加 FamilyMember.cookingSkill / maxComplexity
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "FamilyMember"
    ADD COLUMN IF NOT EXISTS "cookingSkill" "SkillLevel",
    ADD COLUMN IF NOT EXISTS "maxComplexity" INTEGER
  `);
  console.log("✓ FamilyMember 新增 cookingSkill / maxComplexity");

  // 2. 添加 Wish.manualRecipe
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Wish"
    ADD COLUMN IF NOT EXISTS "manualRecipe" TEXT
  `);
  console.log("✓ Wish 新增 manualRecipe");

  // 3. 把现有 KitchenProfile.skillLevel / maxComplexity 拷贝到 chef（ADMIN/CHEF 的 FamilyMember）
  const hasOld =
    (await columnExists("KitchenProfile", "skillLevel")) &&
    (await columnExists("KitchenProfile", "maxComplexity"));
  if (hasOld) {
    const result = await prisma.$executeRawUnsafe(`
      UPDATE "FamilyMember" fm
      SET "cookingSkill" = kp."skillLevel",
          "maxComplexity" = kp."maxComplexity"
      FROM "KitchenProfile" kp, "User" u
      WHERE fm."familyId" = kp."familyId"
        AND fm."userId" = u.id
        AND u."role" IN ('ADMIN', 'CHEF')
    `);
    console.log(`✓ 拷贝 KitchenProfile → FamilyMember，受影响行 ${result}`);

    // 4. 删除 KitchenProfile 的旧字段
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "KitchenProfile"
      DROP COLUMN IF EXISTS "skillLevel",
      DROP COLUMN IF EXISTS "maxComplexity"
    `);
    console.log("✓ 删除 KitchenProfile.skillLevel / maxComplexity");
  } else {
    console.log("· KitchenProfile 已无旧字段，跳过拷贝/删除");
  }

  console.log("=== done ===");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
