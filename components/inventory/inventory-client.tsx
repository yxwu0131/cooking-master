"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  AlertTriangle,
  Snowflake,
  Refrigerator,
  Package,
  XCircle,
  CheckSquare,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  deleteInventoryItemAction,
  deleteInventoryItemsAction,
  clearAllInventoryAction,
  bulkAddInventoryAction,
} from "@/lib/actions/inventory";
import { cn } from "@/lib/utils";

type Ingredient = {
  id: string;
  name: string;
  category: string;
  unit: string;
  defaultShelfLifeDays: number | null;
};

type InventoryItem = {
  id: string;
  quantity: number;
  unit: string;
  location: string;
  expiresAt: Date | null;
  ingredient: Ingredient;
};

const CATEGORY_LABEL: Record<string, string> = {
  MEAT: "肉类",
  POULTRY: "禽类",
  SEAFOOD: "水产",
  VEGETABLE: "蔬菜",
  FRUIT: "水果",
  EGG_DAIRY: "蛋奶",
  SOY: "豆制品",
  GRAIN: "主食",
  SEASONING: "调料",
  DRY_GOODS: "干货",
  OTHER: "其他",
};

const LOCATION_ICON = {
  REFRIGERATED: Refrigerator,
  FROZEN: Snowflake,
  ROOM_TEMP: Package,
};

const LOCATION_LABEL = {
  REFRIGERATED: "冷藏",
  FROZEN: "冷冻",
  ROOM_TEMP: "常温",
};

function daysUntil(date: Date | null): number | null {
  if (!date) return null;
  const ms = new Date(date).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export function InventoryClient({
  items,
  ingredients,
}: {
  items: InventoryItem[];
  ingredients: Ingredient[];
}) {
  const [pending, startTransition] = React.useTransition();
  const [addOpen, setAddOpen] = React.useState(false);
  const [quickPick, setQuickPick] = React.useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [confirmClear, setConfirmClear] = React.useState(false);

  const grouped = React.useMemo(() => {
    const m = new Map<string, InventoryItem[]>();
    for (const item of items) {
      const cat = item.ingredient.category;
      if (!m.has(cat)) m.set(cat, []);
      m.get(cat)!.push(item);
    }
    return m;
  }, [items]);

  const expiringSoon = items.filter((i) => {
    const d = daysUntil(i.expiresAt);
    return d !== null && d <= 3;
  });

  const filteredIngredients = React.useMemo(() => {
    if (!searchTerm.trim()) return ingredients;
    const term = searchTerm.toLowerCase();
    return ingredients.filter((i) => i.name.toLowerCase().includes(term));
  }, [ingredients, searchTerm]);

  const ingredientsByCat = React.useMemo(() => {
    const m = new Map<string, Ingredient[]>();
    for (const ing of filteredIngredients) {
      if (ing.category === "SEASONING") continue; // 调料一般不放库存
      if (!m.has(ing.category)) m.set(ing.category, []);
      m.get(ing.category)!.push(ing);
    }
    return m;
  }, [filteredIngredients]);

  function toggleQuickPick(id: string) {
    setQuickPick((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submitQuickAdd() {
    const picked = Array.from(quickPick);
    if (picked.length === 0) return;
    // quantity 不传，由 server 按 category 推断合理默认（肉 500g、米 1kg、菜 1 个…）
    const payload = picked.map((id) => {
      const ing = ingredients.find((x) => x.id === id)!;
      return { ingredientId: id, unit: ing.unit };
    });
    startTransition(async () => {
      const result = await bulkAddInventoryAction(payload);
      if (result.ok) {
        toast.success(`已添加 ${picked.length} 种食材`);
        setQuickPick(new Set());
        setAddOpen(false);
      } else {
        toast.error("添加失败");
      }
    });
  }

  function remove(id: string) {
    if (!confirm("从库存移除？")) return;
    startTransition(async () => {
      const result = await deleteInventoryItemAction(id);
      if (result.ok) toast.success("已移除");
      else toast.error(result.error);
    });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectGroup(groupItems: InventoryItem[]) {
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = groupItems.every((it) => next.has(it.id));
      if (allSelected) {
        for (const it of groupItems) next.delete(it.id);
      } else {
        for (const it of groupItems) next.add(it.id);
      }
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(items.map((i) => i.id)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function deleteSelected() {
    if (selected.size === 0) return;
    if (!confirm(`确定移除选中的 ${selected.size} 项？`)) return;
    const ids = Array.from(selected);
    startTransition(async () => {
      const result = await deleteInventoryItemsAction(ids);
      if (result.ok) {
        toast.success(`已移除 ${result.count} 项`);
        setSelected(new Set());
      } else {
        toast.error("批量移除失败");
      }
    });
  }

  function performClearAll() {
    startTransition(async () => {
      const result = await clearAllInventoryAction();
      if (result.ok) {
        toast.success(`已清空全部 ${result.count} 项`);
        setSelected(new Set());
        setConfirmClear(false);
      } else {
        toast.error("清空失败");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">食材库存</h1>
          <p className="text-sm text-muted-foreground">
            录入家里有的食材，让厨神知道用什么做菜。
          </p>
        </div>
        <div className="flex gap-2">
          {items.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmClear(true)}
              disabled={pending}
            >
              <XCircle className="size-4" />
              清空全部
            </Button>
          )}
          <Button onClick={() => setAddOpen(true)} size="sm">
            <Plus className="size-4" />
            添加食材
          </Button>
        </div>
      </div>

      {expiringSoon.length > 0 && (
        <Card className="border-amber-300 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="pt-4 pb-4 flex gap-3 items-start">
            <AlertTriangle className="size-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="font-medium text-amber-900 dark:text-amber-100">
                {expiringSoon.length} 种食材即将过期，建议优先消耗
              </div>
              <div className="text-amber-800 dark:text-amber-200 mt-0.5">
                {expiringSoon.map((i) => i.ingredient.name).join("、")}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">
              还没有库存。点击右上角「添加食材」开始录入。
            </p>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="size-4" />
              添加第一种食材
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs">
            <Button variant="ghost" size="sm" onClick={selectAll} disabled={pending}>
              <CheckSquare className="size-3.5" />
              全选 {items.length} 项
            </Button>
            {selected.size > 0 && (
              <Button variant="ghost" size="sm" onClick={clearSelection} disabled={pending}>
                <Square className="size-3.5" />
                取消选择
              </Button>
            )}
          </div>
          {Array.from(grouped.entries()).map(([cat, list]) => {
            const groupAllSelected = list.every((it) => selected.has(it.id));
            return (
              <div key={cat}>
                <div className="flex items-center gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => toggleSelectGroup(list)}
                    className="text-sm font-semibold text-muted-foreground inline-flex items-center gap-1 hover:text-foreground"
                  >
                    {groupAllSelected ? (
                      <CheckSquare className="size-3.5" />
                    ) : (
                      <Square className="size-3.5" />
                    )}
                    {CATEGORY_LABEL[cat] ?? cat}（{list.length}）
                  </button>
                </div>
                <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {list.map((item) => {
                    const days = daysUntil(item.expiresAt);
                    const expiringSoon = days !== null && days <= 3;
                    const Icon = LOCATION_ICON[item.location as keyof typeof LOCATION_ICON];
                    const isChecked = selected.has(item.id);
                    return (
                      <Card
                        key={item.id}
                        className={cn(
                          "transition-colors cursor-pointer",
                          expiringSoon && "border-amber-300",
                          isChecked && "ring-2 ring-primary border-primary"
                        )}
                        onClick={() => toggleSelect(item.id)}
                      >
                        <CardContent className="py-3 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSelect(item.id);
                            }}
                            className="shrink-0 text-muted-foreground hover:text-foreground"
                            aria-label="选择"
                          >
                            {isChecked ? (
                              <CheckSquare className="size-4 text-primary" />
                            ) : (
                              <Square className="size-4" />
                            )}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">
                              {item.ingredient.name}
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                              <span>
                                {item.quantity} {item.unit}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Icon className="size-3" />
                                {LOCATION_LABEL[item.location as keyof typeof LOCATION_LABEL]}
                              </span>
                              {days !== null && (
                                <Badge
                                  variant={expiringSoon ? "warning" : "outline"}
                                  className="text-xs"
                                >
                                  {days <= 0 ? "已过期" : `${days}天`}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              remove(item.id);
                            }}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 选中后浮动操作栏 */}
      {selected.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30">
          <div className="rounded-full border bg-background shadow-lg pl-4 pr-2 py-2 flex items-center gap-2">
            <span className="text-sm">已选 {selected.size} 项</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSelection}
              disabled={pending}
            >
              取消
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={deleteSelected}
              disabled={pending}
            >
              <Trash2 className="size-3.5" />
              移除选中
            </Button>
          </div>
        </div>
      )}

      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>清空全部库存？</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            将移除全部 {items.length} 项库存记录，操作不可撤销。
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmClear(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={performClearAll} disabled={pending}>
              <XCircle className="size-4" />
              确认清空
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>批量添加食材</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              placeholder="搜索食材..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              点击勾选，默认数量 1（添加后可编辑）
            </p>
          </div>
          <div className="flex-1 overflow-y-auto space-y-3 -mx-2 px-2">
            {Array.from(ingredientsByCat.entries()).map(([cat, list]) => (
              <div key={cat}>
                <div className="text-xs font-medium text-muted-foreground mb-1.5">
                  {CATEGORY_LABEL[cat] ?? cat}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {list.map((ing) => {
                    const selected = quickPick.has(ing.id);
                    return (
                      <button
                        key={ing.id}
                        type="button"
                        onClick={() => toggleQuickPick(ing.id)}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs transition-colors",
                          selected
                            ? "bg-primary text-primary-foreground border-primary"
                            : "hover:bg-accent"
                        )}
                      >
                        {ing.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              取消
            </Button>
            <Button
              onClick={submitQuickAdd}
              disabled={pending || quickPick.size === 0}
            >
              添加选中的 {quickPick.size} 项
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
