"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Trash2, Check, Sparkles, ChevronDown, Pencil, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  createWishAction,
  deleteWishAction,
  markWishCookedAction,
  parseWishToDishAction,
  updateWishAction,
} from "@/lib/actions/dishes";

type Wish = {
  id: string;
  raw: string;
  occasion: string | null;
  status: string;
  manualRecipe: string | null;
  parsedDishId: string | null;
  parsedDish: { id: string; name: string } | null;
  createdAt: Date;
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "待沉淀",
  PARSED: "已识别",
  COOKED: "已做过",
  DISMISSED: "放弃",
};

export function WishesSection({ wishes }: { wishes: Wish[] }) {
  const [raw, setRaw] = React.useState("");
  const [manualRecipe, setManualRecipe] = React.useState("");
  const [showManual, setShowManual] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [editingRecipeFor, setEditingRecipeFor] = React.useState<string | null>(null);
  const [editingRecipeText, setEditingRecipeText] = React.useState("");

  function add() {
    if (!raw.trim()) return;
    startTransition(async () => {
      const result = await createWishAction({
        raw: raw.trim(),
        occasion: null,
        manualRecipe: manualRecipe.trim() || null,
      });
      if (result.ok) {
        toast.success(
          manualRecipe.trim()
            ? "已添加，含做法草稿。可点「AI 入库」让厨神补全后纳入菜品库"
            : "已添加到灵感库"
        );
        setRaw("");
        setManualRecipe("");
        setShowManual(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await deleteWishAction(id);
      toast.success("已删除");
    });
  }

  function markCooked(id: string) {
    startTransition(async () => {
      await markWishCookedAction(id);
      toast.success("已标记为做过");
    });
  }

  function parseToDish(id: string) {
    startTransition(async () => {
      const t = toast.loading("AI 正在按你的做法草稿补全菜谱并入库...");
      const result = await parseWishToDishAction(id);
      toast.dismiss(t);
      if (result.ok) {
        toast.success(`已入库：${result.dishName}`);
      } else {
        toast.error(result.error);
      }
    });
  }

  function openEditRecipe(w: Wish) {
    setEditingRecipeFor(w.id);
    setEditingRecipeText(w.manualRecipe ?? "");
  }

  function saveEditRecipe() {
    if (!editingRecipeFor) return;
    const id = editingRecipeFor;
    const text = editingRecipeText;
    startTransition(async () => {
      const result = await updateWishAction({ wishId: id, manualRecipe: text || null });
      if (result.ok) {
        toast.success("已保存做法草稿");
        setEditingRecipeFor(null);
      } else {
        toast.error(result.error);
      }
    });
  }

  const active = wishes.filter((w) => w.status === "PENDING" || w.status === "PARSED");
  const done = wishes.filter((w) => w.status === "COOKED");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="rounded-lg bg-primary/10 p-1.5">
          <Sparkles className="size-4 text-primary" />
        </div>
        <h2 className="text-lg font-semibold">灵感库</h2>
      </div>

      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex gap-2">
            <Input
              placeholder="想试番茄牛腩 / 周末想做蒜香排骨 / 想喝冬瓜丸子汤..."
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !showManual) add();
              }}
              disabled={pending}
            />
            <Button onClick={add} disabled={pending || !raw.trim()}>
              <Plus className="size-4" />
              添加
            </Button>
          </div>
          <button
            type="button"
            onClick={() => setShowManual((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ChevronDown
              className={`size-3 transition-transform ${showManual ? "rotate-180" : ""}`}
            />
            {showManual ? "收起做法" : "我知道做法（可选填，给 AI 补全后入库）"}
          </button>
          {showManual && (
            <Textarea
              value={manualRecipe}
              onChange={(e) => setManualRecipe(e.target.value)}
              placeholder={"如：\n1. 牛腩切块焯水，下姜片葱段去腥\n2. 砂锅炖 1.5 小时，再下番茄块煮 20 分钟\n3. 出锅前加盐和糖少许"}
              rows={4}
              className="font-mono text-xs"
            />
          )}
        </CardContent>
      </Card>

      {active.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">想做（{active.length}）</h3>
          <div className="space-y-1.5">
            {active.map((w) => {
              const isEditing = editingRecipeFor === w.id;
              return (
                <Card key={w.id}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm flex items-center gap-2 flex-wrap">
                          <span>{w.raw}</span>
                          {w.parsedDish && (
                            <Link
                              href={`/dishes/${w.parsedDish.id}`}
                              className="text-xs text-primary hover:underline"
                            >
                              → {w.parsedDish.name}
                            </Link>
                          )}
                          <Badge variant="outline" className="text-xs">
                            {STATUS_LABEL[w.status]}
                          </Badge>
                          {w.manualRecipe && (
                            <Badge variant="secondary" className="text-xs">
                              <BookOpen className="size-3" />
                              含做法
                            </Badge>
                          )}
                        </div>
                      </div>
                      {!w.parsedDish && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => parseToDish(w.id)}
                          disabled={pending}
                          title="让 AI 按你的做法补全后入菜品库"
                        >
                          <Sparkles className="size-3.5" />
                          AI 入库
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditRecipe(w)}
                        title="编辑做法草稿"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => markCooked(w.id)}
                        title="标记已做过"
                      >
                        <Check className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(w.id)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                    {isEditing && (
                      <div className="space-y-2">
                        <Textarea
                          value={editingRecipeText}
                          onChange={(e) => setEditingRecipeText(e.target.value)}
                          rows={5}
                          placeholder="写下你知道的做法步骤、份量、火候..."
                          className="font-mono text-xs"
                        />
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingRecipeFor(null)}
                            disabled={pending}
                          >
                            取消
                          </Button>
                          <Button size="sm" onClick={saveEditRecipe} disabled={pending}>
                            保存
                          </Button>
                        </div>
                      </div>
                    )}
                    {!isEditing && w.manualRecipe && (
                      <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans bg-muted/30 rounded p-2">
                        {w.manualRecipe}
                      </pre>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {done.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            已做过的（{done.length}）
          </summary>
          <div className="space-y-1 mt-2">
            {done.map((w) => (
              <div key={w.id} className="text-xs text-muted-foreground flex items-center gap-2">
                <span>· {w.raw}</span>
                <button
                  className="hover:text-destructive ml-auto"
                  onClick={() => remove(w.id)}
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
