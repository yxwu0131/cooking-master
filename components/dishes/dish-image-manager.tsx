"use client";

import * as React from "react";
import { toast } from "sonner";
import { ImagePlus, Upload, RefreshCw, X, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dishEmoji } from "@/lib/dish-visual";
import {
  getDishImageCandidatesAction,
  pickDishImageAction,
  uploadDishImageAction,
  clearDishImageAction,
} from "@/lib/actions/dish-images";

type Dish = {
  id: string;
  name: string;
  cuisine: string | null;
  isSoup: boolean;
  isVegetarian: boolean;
  imageUrl: string | null;
};

type Candidate = { idx: number; url: string; ext: string };

export function DishImageManager({ dishes }: { dishes: Dish[] }) {
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState<"all" | "with" | "without">("all");

  // 本地可变状态：imageUrl + 版本号（换图后用 ?v= 破缓存刷新预览）
  const [urls, setUrls] = React.useState<Record<string, string | null>>(() =>
    Object.fromEntries(dishes.map((d) => [d.id, d.imageUrl]))
  );
  const [ver, setVer] = React.useState<Record<string, number>>({});
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [cands, setCands] = React.useState<Record<string, Candidate[]>>({});
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const uploadRef = React.useRef<HTMLInputElement>(null);
  const uploadTarget = React.useRef<string | null>(null);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return dishes.filter((d) => {
      if (q && !d.name.toLowerCase().includes(q) && !(d.cuisine ?? "").includes(q))
        return false;
      const has = Boolean(urls[d.id]);
      if (filter === "with" && !has) return false;
      if (filter === "without" && has) return false;
      return true;
    });
  }, [dishes, search, filter, urls]);

  const withCount = dishes.filter((d) => urls[d.id]).length;
  const previewUrl = (id: string) => {
    const u = urls[id];
    return u ? `${u}${ver[id] ? `?v=${ver[id]}` : ""}` : null;
  };

  async function openCandidates(d: Dish) {
    if (openId === d.id) {
      setOpenId(null);
      return;
    }
    setOpenId(d.id);
    if (cands[d.id]) return; // 已搜过，直接展开
    setBusyId(d.id);
    try {
      const res = await getDishImageCandidatesAction(d.id);
      if (res.ok) {
        setCands((c) => ({ ...c, [d.id]: res.candidates }));
      } else {
        toast.error(res.error);
        setOpenId(null);
      }
    } finally {
      setBusyId(null);
    }
  }

  async function pick(d: Dish, cand: Candidate) {
    setBusyId(d.id);
    try {
      const res = await pickDishImageAction(d.id, cand.idx, cand.ext);
      if (res.ok) {
        setUrls((u) => ({ ...u, [d.id]: res.imageUrl }));
        setVer((v) => ({ ...v, [d.id]: (v[d.id] ?? 0) + 1 }));
        setOpenId(null);
        setCands((c) => ({ ...c, [d.id]: [] }));
        toast.success(`已更新「${d.name}」的图`);
      } else {
        toast.error(res.error);
      }
    } finally {
      setBusyId(null);
    }
  }

  function triggerUpload(dishId: string) {
    uploadTarget.current = dishId;
    uploadRef.current?.click();
  }

  async function onUploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const dishId = uploadTarget.current;
    e.target.value = "";
    if (!file || !dishId) return;
    const d = dishes.find((x) => x.id === dishId);
    setBusyId(dishId);
    try {
      const fd = new FormData();
      fd.set("image", file);
      const res = await uploadDishImageAction(dishId, fd);
      if (res.ok) {
        setUrls((u) => ({ ...u, [dishId]: res.imageUrl }));
        setVer((v) => ({ ...v, [dishId]: (v[dishId] ?? 0) + 1 }));
        toast.success(`已上传「${d?.name}」的图`);
      } else {
        toast.error(res.error);
      }
    } finally {
      setBusyId(null);
    }
  }

  async function clearImg(d: Dish) {
    setBusyId(d.id);
    try {
      const res = await clearDishImageAction(d.id);
      if (res.ok) {
        setUrls((u) => ({ ...u, [d.id]: null }));
        toast.success(`已清除「${d.name}」的图`);
      } else {
        toast.error(res.error);
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-3">
      <input
        ref={uploadRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={onUploadFile}
      />

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜菜名或菜系…"
          className="flex-1"
        />
        <div className="flex gap-1">
          {(
            [
              ["all", `全部 ${dishes.length}`],
              ["with", `有图 ${withCount}`],
              ["without", `没图 ${dishes.length - withCount}`],
            ] as const
          ).map(([k, label]) => (
            <Button
              key={k}
              variant={filter === k ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(k)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {filtered.map((d) => {
          const busy = busyId === d.id;
          const open = openId === d.id;
          const list = cands[d.id];
          return (
            <div key={d.id} className="rounded-xl border bg-card">
              <div className="flex items-center gap-3 p-2.5">
                {/* 当前预览用原生 img：可换可传、需带 ?v 破缓存，不走 next/image（避开 localPatterns 限制） */}
                <div className="size-14 shrink-0 overflow-hidden rounded-lg bg-accent flex items-center justify-center text-2xl leading-none">
                  {urls[d.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewUrl(d.id)!}
                      alt={d.name}
                      className="size-full object-cover"
                    />
                  ) : (
                    <span aria-hidden>{dishEmoji(d.cuisine, d.isSoup, d.isVegetarian)}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{d.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {d.cuisine ?? "家常"} · {urls[d.id] ? "已有图" : "未配图"}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openCandidates(d)}
                    disabled={busy}
                  >
                    {busy && open ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="size-3.5" />
                    )}
                    换图
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    title="上传自家照片"
                    onClick={() => triggerUpload(d.id)}
                    disabled={busy}
                  >
                    <Upload className="size-4" />
                  </Button>
                  {urls[d.id] && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground"
                      title="清除图"
                      onClick={() => clearImg(d)}
                      disabled={busy}
                    >
                      <X className="size-4" />
                    </Button>
                  )}
                </div>
              </div>

              {open && (
                <div className="border-t p-2.5">
                  {!list && busy && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-3 justify-center">
                      <Loader2 className="size-4 animate-spin" />
                      正在搜候选图…
                    </div>
                  )}
                  {list && list.length > 0 && (
                    <>
                      <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                        <ImagePlus className="size-3.5" />
                        点一张即设为「{d.name}」的图
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {list.map((c) => (
                          <button
                            key={c.idx}
                            type="button"
                            onClick={() => pick(d, c)}
                            disabled={busy}
                            className="relative aspect-square overflow-hidden rounded-lg border hover:ring-2 hover:ring-primary transition disabled:opacity-50 group"
                          >
                            {/* 候选图用原生 img：临时图、不必走 next/image 优化 */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={c.url}
                              alt=""
                              className="size-full object-cover"
                              loading="lazy"
                            />
                            <span className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-primary/30">
                              <Check className="size-6 text-white drop-shadow" />
                            </span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">没有匹配的菜</p>
        )}
      </div>
    </div>
  );
}
