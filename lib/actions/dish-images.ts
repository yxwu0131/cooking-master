"use server";

import { revalidatePath } from "next/cache";
import { writeFile, mkdir, rm, copyFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth-helper";
import {
  DISH_DIR,
  CAND_DIR,
  keyFor,
  searchCandidates,
  downloadImage,
  removeDishImages,
  extForType,
} from "@/lib/dish-image-fetch";

function revalidateDishPaths(dishId: string) {
  revalidatePath("/dishes");
  revalidatePath("/dishes/images");
  revalidatePath(`/dishes/${dishId}`);
  revalidatePath("/cook", "layout");
}

/**
 * 取某菜的候选成品图：搜 Bing → 服务端下载（绕防盗链）→ 存临时目录 _cand/<key>/<i>.<ext>，
 * 返回可直接预览的本地 URL（经 /api/img 服务）。
 */
export async function getDishImageCandidatesAction(dishId: string) {
  await requireUser();
  // 实时网络抓图默认停用：盲评命中率仅 ~6.7% 且出现过 NSFW，并有服务端 SSRF 面（见 NOTES 坑33/坑34 评测）。
  // 仅在显式开启 ENABLE_DISH_IMAGE_FETCH=1 时启用；日常请用「上传照片」（uploadDishImageAction，已校验类型/大小）。
  if (process.env.ENABLE_DISH_IMAGE_FETCH !== "1") {
    return { ok: false as const, error: "自动抓图已停用，请改用「上传照片」" };
  }
  const dish = await prisma.dish.findUnique({
    where: { id: dishId },
    select: { name: true },
  });
  if (!dish) return { ok: false as const, error: "菜品不存在" };

  const key = keyFor(dish.name);
  const dir = path.join(CAND_DIR, key);
  await rm(dir, { recursive: true, force: true }); // 清上次候选
  await mkdir(dir, { recursive: true });

  const urls = (await searchCandidates(dish.name)).slice(0, 16);
  const downloaded = await Promise.allSettled(urls.map((u) => downloadImage(u)));

  const candidates: Array<{ idx: number; url: string; ext: string }> = [];
  let i = 0;
  for (const r of downloaded) {
    if (candidates.length >= 9) break;
    if (r.status === "fulfilled" && r.value) {
      const { buf, ext } = r.value;
      await writeFile(path.join(dir, `${i}.${ext}`), buf);
      candidates.push({ idx: i, url: `/api/img/_cand/${key}/${i}.${ext}`, ext });
      i++;
    }
  }

  if (candidates.length === 0) {
    return { ok: false as const, error: "没搜到可用图，试试上传自己的照片" };
  }
  return { ok: true as const, candidates };
}

/** 选定某候选图：把临时图落到 dish/<key>.<ext> 并写回 imageUrl */
export async function pickDishImageAction(dishId: string, idx: number, ext: string) {
  await requireUser();
  if (!["jpg", "png", "webp"].includes(ext)) {
    return { ok: false as const, error: "格式不支持" };
  }
  const dish = await prisma.dish.findUnique({
    where: { id: dishId },
    select: { name: true },
  });
  if (!dish) return { ok: false as const, error: "菜品不存在" };

  const key = keyFor(dish.name);
  const src = path.join(CAND_DIR, key, `${idx}.${ext}`);
  try {
    await removeDishImages(key);
    await copyFile(src, path.join(DISH_DIR, `${key}.${ext}`));
  } catch {
    return { ok: false as const, error: "候选图已失效，请重新搜索" };
  }
  await prisma.dish.update({
    where: { id: dishId },
    data: { imageUrl: `/api/img/dish/${key}.${ext}` },
  });
  await rm(path.join(CAND_DIR, key), { recursive: true, force: true });
  revalidateDishPaths(dishId);
  return { ok: true as const, imageUrl: `/api/img/dish/${key}.${ext}` };
}

/** 上传自家照片：保存到 dish/<key>.<ext> 并写回 imageUrl */
export async function uploadDishImageAction(dishId: string, formData: FormData) {
  await requireUser();
  const file = formData.get("image");
  if (!(file instanceof File)) return { ok: false as const, error: "没有文件" };
  const ext = extForType(file.type);
  if (!ext) return { ok: false as const, error: "只支持 jpg/png/webp" };
  if (file.size < 1000 || file.size > 8_000_000) {
    return { ok: false as const, error: "图片大小需在 1KB–8MB 之间" };
  }
  const dish = await prisma.dish.findUnique({
    where: { id: dishId },
    select: { name: true },
  });
  if (!dish) return { ok: false as const, error: "菜品不存在" };

  const key = keyFor(dish.name);
  const buf = Buffer.from(await file.arrayBuffer());
  await mkdir(DISH_DIR, { recursive: true });
  await removeDishImages(key);
  await writeFile(path.join(DISH_DIR, `${key}.${ext}`), buf);
  await prisma.dish.update({
    where: { id: dishId },
    data: { imageUrl: `/api/img/dish/${key}.${ext}` },
  });
  revalidateDishPaths(dishId);
  return { ok: true as const, imageUrl: `/api/img/dish/${key}.${ext}` };
}

/** 清除某菜的图（回到 emoji 占位） */
export async function clearDishImageAction(dishId: string) {
  await requireUser();
  const dish = await prisma.dish.findUnique({
    where: { id: dishId },
    select: { name: true },
  });
  if (!dish) return { ok: false as const, error: "菜品不存在" };
  await removeDishImages(keyFor(dish.name));
  await prisma.dish.update({ where: { id: dishId }, data: { imageUrl: null } });
  revalidateDishPaths(dishId);
  return { ok: true as const };
}
