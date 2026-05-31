import type { NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

// 菜品/食材成品图存本地卷（IMAGES_DIR），通过本路由经 cloudflared 隧道服务，
// 不依赖外部对象存储（避免国内访问 supabase.co 不稳）。imageUrl 形如 /api/img/dish/<id>.jpg
const IMAGES_DIR = process.env.IMAGES_DIR || "./data/images";
const ROOT = path.resolve(process.cwd(), IMAGES_DIR);

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segs } = await params;
  const full = path.resolve(ROOT, segs.join("/"));

  // 防目录穿越：解析后必须仍在 ROOT 内
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) {
    return new Response("Not found", { status: 404 });
  }

  const type = CONTENT_TYPES[path.extname(full).toLowerCase()];
  if (!type) return new Response("Unsupported media type", { status: 415 });

  try {
    const buf = await readFile(full);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": type,
        // 不用 immutable：菜品图可在后台换/传，文件名按菜名哈希不变，需允许刷新。
        "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
