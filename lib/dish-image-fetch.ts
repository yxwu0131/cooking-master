/**
 * 菜品图抓取/下载公共库：被批量脚本 scripts/fetch-dish-images.ts 与
 * 选图后台的 server actions（lib/actions/dish-images.ts）共用。
 * 不要加 "server-only"——批量脚本是纯 node 进程，也要 import 它。
 */
import { writeFile, mkdir, access, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

export const IMAGES_DIR = process.env.IMAGES_DIR || "./data/images";
export const DISH_DIR = path.resolve(process.cwd(), IMAGES_DIR, "dish");
/** 候选图临时目录（在 IMAGES_DIR 下，可被 /api/img 路由直接服务） */
export const CAND_DIR = path.resolve(process.cwd(), IMAGES_DIR, "_cand");

export const IMG_EXTS = ["jpg", "png", "webp"] as const;
const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** 文件名键：菜名 sha1 前 16 位（跨库稳定，dish.name 是 @unique） */
export const keyFor = (name: string) =>
  createHash("sha1").update(name).digest("hex").slice(0, 16);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** 单次抓 Bing images/async（干净结果格），解析候选原图 URL */
async function bingOnce(query: string): Promise<string[]> {
  const url =
    "https://www.bing.com/images/async?q=" +
    encodeURIComponent(query) +
    "&first=1&count=35&mmasync=1&mkt=zh-CN&qft=+filterui:imagesize-large+filterui:photo-photo";
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9" },
      signal: ctrl.signal,
    });
    const html = await res.text();
    const urls: string[] = [];
    const re = /m="([^"]+)"/g;
    let mm: RegExpExecArray | null;
    while ((mm = re.exec(html))) {
      try {
        const obj = JSON.parse(decodeEntities(mm[1]));
        if (obj.murl && typeof obj.murl === "string") urls.push(obj.murl);
      } catch {
        /* 跳过坏 json */
      }
    }
    return urls;
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

/** 多查询合并去重，返回候选原图 URL 列表 */
export async function searchCandidates(name: string): Promise<string[]> {
  const seen = new Set<string>();
  const merge = (arr: string[]) => arr.forEach((u) => seen.add(u));
  merge(await bingOnce(`${name} 美食 成品`));
  if (seen.size < 10) {
    await sleep(300);
    merge(await bingOnce(`${name} 菜 做法`));
  }
  return [...seen];
}

/** 下载一张图，校验类型/大小；成功返回 {buf, ext}，否则 null。
 *  Referer 设为图片自身 origin，绕过部分防盗链。 */
export async function downloadImage(
  imgUrl: string
): Promise<{ buf: Buffer; ext: string } | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    let referer = "https://www.bing.com/";
    try {
      referer = new URL(imgUrl).origin + "/";
    } catch {
      /* 用默认 */
    }
    const res = await fetch(imgUrl, {
      headers: { "User-Agent": UA, Referer: referer },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") || "").split(";")[0].trim();
    const ext = EXT_BY_TYPE[ct];
    if (!ext) return null;
    const ab = await res.arrayBuffer();
    if (ab.byteLength < 6000 || ab.byteLength > 8_000_000) return null;
    return { buf: Buffer.from(ab), ext };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export const EXT_OK = (ct: string) => Boolean(EXT_BY_TYPE[ct]);
export const extForType = (ct: string) => EXT_BY_TYPE[ct.split(";")[0].trim()];

/** 删掉某菜在 dish 目录下所有扩展名的旧图（换图前清理，避免孤儿/扩展名错配） */
export async function removeDishImages(key: string): Promise<void> {
  for (const ext of IMG_EXTS) {
    await rm(path.join(DISH_DIR, `${key}.${ext}`), { force: true });
  }
}

/** 找菜在 dish 目录已存在的图扩展名 */
export async function existingExt(key: string): Promise<string | null> {
  for (const ext of IMG_EXTS) {
    try {
      await access(path.join(DISH_DIR, `${key}.${ext}`));
      return ext;
    } catch {
      /* next */
    }
  }
  return null;
}

export { mkdir, writeFile, path };
