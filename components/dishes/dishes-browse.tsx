"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Heart, Star, Baby, Ban, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setFamilyDishStatusAction, removeFamilyDishAction } from "@/lib/actions/dishes";
import { cn } from "@/lib/utils";

type Dish = {
  id: string;
  name: string;
  cuisine: string | null;
  difficulty: number;
  totalMinutes: number;
  tags: string[];
  isSpicy: boolean;
  isChildFriendly: boolean;
  isLight: boolean;
  isHearty: boolean;
  isSoup: boolean;
  isVegetarian: boolean;
  familyDishes: { status: string; rating: number | null; cookCount: number }[];
};

const STATUS_LABELS: Record<string, string> = {
  STAPLE: "我家常做",
  LOVED: "我家喜欢",
  KID_FAVORITE: "孩子爱吃",
  WANT_TO_TRY: "想尝试",
  WEEKDAY: "工作日",
  WEEKEND: "周末",
  LUNCH_BOX: "带饭",
  DISLIKED: "不喜欢",
  BLOCKED: "别推荐",
};

const CUISINE_EMOJI: Record<string, string> = {
  家常菜: "🍳",
  川菜: "🌶️",
  粤菜: "🦐",
  湘菜: "🔥",
  西餐: "🍝",
  江浙菜: "🦀",
  北方菜: "🥟",
  主食: "🍚",
};

function dishEmoji(cuisine: string | null, isSoup: boolean, isVegetarian: boolean) {
  if (isSoup) return "🍲";
  if (cuisine && CUISINE_EMOJI[cuisine]) return CUISINE_EMOJI[cuisine];
  if (isVegetarian) return "🥬";
  return "🍽️";
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "success"> = {
  STAPLE: "success",
  LOVED: "success",
  KID_FAVORITE: "default",
  WANT_TO_TRY: "secondary",
  WEEKDAY: "secondary",
  WEEKEND: "secondary",
  LUNCH_BOX: "secondary",
  DISLIKED: "destructive",
  BLOCKED: "destructive",
};

export function DishesBrowse({ dishes }: { dishes: Dish[] }) {
  const [search, setSearch] = React.useState("");
  const [cuisine, setCuisine] = React.useState<string>("all");
  const [filter, setFilter] = React.useState<string>("all");
  const [pending, startTransition] = React.useTransition();

  const cuisines = React.useMemo(() => {
    const set = new Set(dishes.map((d) => d.cuisine).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [dishes]);

  const filtered = React.useMemo(() => {
    return dishes.filter((d) => {
      if (search && !d.name.includes(search)) return false;
      if (cuisine !== "all" && d.cuisine !== cuisine) return false;
      const fd = d.familyDishes[0];
      if (filter === "loved" && !(fd && (fd.status === "STAPLE" || fd.status === "LOVED" || fd.status === "KID_FAVORITE"))) return false;
      if (filter === "want" && !(fd && fd.status === "WANT_TO_TRY")) return false;
      if (filter === "kid" && !d.isChildFriendly) return false;
      if (filter === "soup" && !d.isSoup) return false;
      if (filter === "veg" && !d.isVegetarian) return false;
      if (filter === "quick" && d.totalMinutes > 15) return false;
      if (fd?.status === "BLOCKED" && filter !== "blocked") return false;
      return true;
    });
  }, [dishes, search, cuisine, filter]);

  function setStatus(dishId: string, status: string) {
    startTransition(async () => {
      const result = await setFamilyDishStatusAction({ dishId, status: status as never });
      if (result.ok) toast.success(`已标记为「${STATUS_LABELS[status]}」`);
      else toast.error(result.error);
    });
  }

  function unmark(dishId: string) {
    startTransition(async () => {
      await removeFamilyDishAction(dishId);
      toast.success("已取消标记");
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          placeholder="搜索菜名..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-xs"
        />
        <Select value={cuisine} onValueChange={setCuisine}>
          <SelectTrigger className="sm:w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部菜系</SelectItem>
            {cuisines.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="sm:w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            <SelectItem value="loved">我家喜欢</SelectItem>
            <SelectItem value="want">想尝试</SelectItem>
            <SelectItem value="kid">儿童友好</SelectItem>
            <SelectItem value="soup">汤类</SelectItem>
            <SelectItem value="veg">素菜</SelectItem>
            <SelectItem value="quick">15分钟内</SelectItem>
            <SelectItem value="blocked">已屏蔽</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="text-sm text-muted-foreground">共 {filtered.length} 道</div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((d) => {
          const fd = d.familyDishes[0];
          return (
            <Card key={d.id} className="hover:shadow-md hover:-translate-y-0.5 transition-all">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-2xl leading-none">
                    {dishEmoji(d.cuisine, d.isSoup, d.isVegetarian)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/dishes/${d.id}`}
                        className="font-semibold hover:text-primary truncate"
                      >
                        {d.name}
                      </Link>
                      <div className="flex items-center gap-0.5 text-xs pt-1.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <span
                            key={i}
                            className={cn(
                              "size-1.5 rounded-full",
                              i < d.difficulty ? "bg-amber-500" : "bg-muted"
                            )}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {d.cuisine} · {d.totalMinutes} 分钟
                      {fd && fd.cookCount > 0 && (
                        <span className="ml-2">· 做过 {fd.cookCount} 次</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {d.isSpicy && (
                    <Badge variant="destructive" className="text-xs">
                      辣
                    </Badge>
                  )}
                  {d.isChildFriendly && (
                    <Badge variant="secondary" className="text-xs">
                      <Baby className="size-2.5" />
                      娃娃
                    </Badge>
                  )}
                  {d.isSoup && (
                    <Badge variant="soft" className="text-xs">
                      汤
                    </Badge>
                  )}
                  {d.isLight && (
                    <Badge variant="fresh" className="text-xs">
                      清淡
                    </Badge>
                  )}
                  {d.isHearty && (
                    <Badge variant="warning" className="text-xs">
                      下饭
                    </Badge>
                  )}
                  {d.isVegetarian && (
                    <Badge variant="fresh" className="text-xs">
                      素
                    </Badge>
                  )}
                </div>

                <div className="mt-3 flex items-center gap-1.5">
                  {fd ? (
                    <Badge variant={STATUS_VARIANT[fd.status] ?? "secondary"}>
                      {STATUS_LABELS[fd.status]}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">未标记</span>
                  )}
                  <Select onValueChange={(v) => v && setStatus(d.id, v)} value="">
                    <SelectTrigger className="h-7 w-auto ml-auto" disabled={pending}>
                      <span className="text-xs px-1 flex items-center gap-1">
                        标记
                        <ChevronDown className="size-3" />
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fd && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => unmark(d.id)}
                      disabled={pending}
                    >
                      <Ban className="size-3" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
