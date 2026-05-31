/**
 * 批量给菜品抓成品图：Bing 图片搜索取首张可用图 → 存 IMAGES_DIR/dish/<sha1(name)>.<ext>
 * → 写回 Dish.imageUrl。交付时由 next/image 优化压缩。抓图/下载逻辑见 lib/dish-image-fetch.ts。
 *
 * 文件名按【菜名 sha1】命名（跨库稳定），不用 cuid——本地抓的图能直接搬 prod：
 * 拷 IMAGES_DIR/dish/* 到 NAS 卷 + 对 prod 库跑 --relink 即可。
 *
 * 用法（绕开 pnpm 预检，参考 seed）：
 *   node --env-file=.env node_modules/.pnpm/tsx@4.22.1/node_modules/tsx/dist/cli.mjs scripts/fetch-dish-images.ts [--limit N] [--force] [--relink]
 *   --limit N  只处理前 N 道（先小批验证）
 *   --force    连已有 imageUrl 的也重抓
 *   --relink   不联网；仅对磁盘已存在对应图文件的菜写回 imageUrl（部署到 prod 用）
 *
 * 注：单张选图/换图/上传走后台页（/dishes/images），本脚本只做批量铺底。
 */
import { PrismaClient } from "@prisma/client";
import {
  DISH_DIR,
  keyFor,
  searchCandidates,
  downloadImage,
  existingExt,
  removeDishImages,
  mkdir,
  writeFile,
  path,
} from "@/lib/dish-image-fetch";

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const limitArg = args.indexOf("--limit");
const LIMIT = limitArg >= 0 ? parseInt(args[limitArg + 1], 10) : undefined;
const FORCE = args.includes("--force");
const RELINK = args.includes("--relink");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await mkdir(DISH_DIR, { recursive: true });

  const dishes = await prisma.dish.findMany({
    where: FORCE || RELINK ? {} : { imageUrl: null },
    orderBy: [{ name: "asc" }],
    take: LIMIT,
    select: { id: true, name: true },
  });

  console.log(
    `待处理 ${dishes.length} 道菜${LIMIT ? `（--limit ${LIMIT}）` : ""}` +
      `${RELINK ? "（--relink 仅按磁盘已有图重连）" : FORCE ? "（--force 重抓）" : ""}`
  );

  let ok = 0;
  let fail = 0;
  for (let i = 0; i < dishes.length; i++) {
    const d = dishes[i];
    const key = keyFor(d.name);
    const tag = `[${i + 1}/${dishes.length}] ${d.name}`;

    if (RELINK) {
      const ext = await existingExt(key);
      if (ext) {
        await prisma.dish.update({
          where: { id: d.id },
          data: { imageUrl: `/api/img/dish/${key}.${ext}` },
        });
        ok++;
      } else {
        fail++;
      }
      continue;
    }

    try {
      const candidates = await searchCandidates(d.name);
      let saved = false;
      for (const c of candidates.slice(0, 12)) {
        const img = await downloadImage(c);
        if (img) {
          await removeDishImages(key); // 清旧扩展名，避免孤儿
          await writeFile(path.join(DISH_DIR, `${key}.${img.ext}`), img.buf);
          await prisma.dish.update({
            where: { id: d.id },
            data: { imageUrl: `/api/img/dish/${key}.${img.ext}` },
          });
          console.log(`${tag} · ✅ ${(img.buf.length / 1024).toFixed(0)}KB .${img.ext}`);
          saved = true;
          ok++;
          break;
        }
      }
      if (!saved) {
        console.log(`${tag} · ⚠️ 无可用图（候选 ${candidates.length}）`);
        fail++;
      }
    } catch (e) {
      console.log(`${tag} · ❌ ${(e as Error).message}`);
      fail++;
    }

    await sleep(700);
  }

  console.log(`\n完成：${RELINK ? "重连" : "成功"} ${ok}，${RELINK ? "无图" : "失败"} ${fail}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
