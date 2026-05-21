"use client";

import * as React from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TagsInput } from "@/components/ui/tags-input";
import {
  createMemberAction,
  deleteMemberAction,
  updateMemberAction,
  type MemberInput,
} from "@/lib/actions/family";

const AGE_GROUP_LABELS: Record<string, string> = {
  TODDLER: "幼儿（0-3岁）",
  CHILD: "儿童（4-12岁）",
  TEEN: "青少年（13-17岁）",
  ADULT: "成人（18-59岁）",
  ELDER: "老人（60岁以上）",
};

type Member = {
  id: string;
  name: string;
  ageGroup: string;
  birthYear: number | null;
  isChild: boolean;
  isElder: boolean;
  userId: string | null;
  dislikes: string[];
  favorites: string[];
  allergies: string[];
  tasteProfile: unknown;
  notes: string | null;
  cookingSkill: string | null;
  maxComplexity: number | null;
};

const SKILL_LABEL: Record<string, string> = {
  BEGINNER: "新手",
  INTERMEDIATE: "熟练",
  ADVANCED: "高手",
};

function emptyMember(): MemberInput {
  return {
    name: "",
    ageGroup: "ADULT",
    birthYear: null,
    isChild: false,
    isElder: false,
    dislikes: [],
    favorites: [],
    allergies: [],
    spicyTolerance: 2,
    saltPreference: "normal",
    notes: null,
    cookingSkill: null,
    maxComplexity: null,
  };
}

export function MembersSection({ members }: { members: Member[] }) {
  const [editing, setEditing] = React.useState<{ id?: string; data: MemberInput } | null>(null);
  const [pending, startTransition] = React.useTransition();

  function openCreate() {
    setEditing({ data: emptyMember() });
  }

  function openEdit(m: Member) {
    const tp = (m.tasteProfile as { spicyTolerance?: number; saltPreference?: string } | null) ?? {};
    setEditing({
      id: m.id,
      data: {
        name: m.name,
        ageGroup: m.ageGroup as MemberInput["ageGroup"],
        birthYear: m.birthYear,
        isChild: m.isChild,
        isElder: m.isElder,
        dislikes: m.dislikes,
        favorites: m.favorites,
        allergies: m.allergies,
        spicyTolerance: tp.spicyTolerance ?? 2,
        saltPreference: (tp.saltPreference as "light" | "normal" | "heavy") ?? "normal",
        notes: m.notes,
        cookingSkill: (m.cookingSkill as MemberInput["cookingSkill"]) ?? null,
        maxComplexity: m.maxComplexity ?? null,
      },
    });
  }

  function save() {
    if (!editing) return;
    startTransition(async () => {
      const result = editing.id
        ? await updateMemberAction(editing.id, editing.data)
        : await createMemberAction(editing.data);
      if (result.ok) {
        toast.success(editing.id ? "已更新成员" : "已添加成员");
        setEditing(null);
      } else {
        toast.error(result.error);
      }
    });
  }

  function remove(id: string) {
    if (!confirm("确定删除这名成员吗？")) return;
    startTransition(async () => {
      const result = await deleteMemberAction(id);
      if (result.ok) toast.success("已删除");
      else toast.error(result.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">家庭成员</h2>
          <p className="text-sm text-muted-foreground">
            含未注册的小孩/老人。系统会根据成员档案匹配口味。
          </p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="size-4" />
          添加成员
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {members.map((m) => {
          const tp = (m.tasteProfile as { spicyTolerance?: number; saltPreference?: string } | null) ?? {};
          return (
            <Card key={m.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{m.name}</CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      {AGE_GROUP_LABELS[m.ageGroup]}
                      {m.userId && <span className="ml-2">· 已注册</span>}
                    </CardDescription>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(m)}>
                      <Pencil className="size-3.5" />
                    </Button>
                    {!m.userId && (
                      <Button variant="ghost" size="icon" onClick={() => remove(m.id)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-2 text-xs">
                <div className="flex gap-1.5 flex-wrap">
                  <Badge variant="outline">辣度 {tp.spicyTolerance ?? 2}/5</Badge>
                  <Badge variant="outline">
                    口味{" "}
                    {tp.saltPreference === "light"
                      ? "清淡"
                      : tp.saltPreference === "heavy"
                        ? "重口"
                        : "适中"}
                  </Badge>
                  {m.cookingSkill && (
                    <Badge variant="secondary">
                      下厨 · {SKILL_LABEL[m.cookingSkill] ?? m.cookingSkill}
                      {m.maxComplexity ? ` · ≤难度${m.maxComplexity}` : ""}
                    </Badge>
                  )}
                </div>
                {m.dislikes.length > 0 && (
                  <div>
                    <span className="text-muted-foreground">不爱吃：</span>
                    {m.dislikes.join("、")}
                  </div>
                )}
                {m.favorites.length > 0 && (
                  <div>
                    <span className="text-muted-foreground">爱吃：</span>
                    {m.favorites.join("、")}
                  </div>
                )}
                {m.allergies.length > 0 && (
                  <div className="text-destructive">
                    <span>过敏：</span>
                    {m.allergies.join("、")}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "编辑成员" : "添加成员"}</DialogTitle>
            <DialogDescription>填写口味档案，系统推荐时会自动避开不爱吃的食材</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>姓名</Label>
                  <Input
                    value={editing.data.name}
                    onChange={(e) =>
                      setEditing({ ...editing, data: { ...editing.data, name: e.target.value } })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>年龄段</Label>
                  <Select
                    value={editing.data.ageGroup}
                    onValueChange={(v) => {
                      const isChild = v === "TODDLER" || v === "CHILD";
                      const isElder = v === "ELDER";
                      setEditing({
                        ...editing,
                        data: { ...editing.data, ageGroup: v as MemberInput["ageGroup"], isChild, isElder },
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(AGE_GROUP_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>辣度承受（0=不吃辣，5=能吃重辣）</Label>
                  <Input
                    type="number"
                    min={0}
                    max={5}
                    value={editing.data.spicyTolerance}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        data: { ...editing.data, spicyTolerance: Number(e.target.value) },
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>咸淡偏好</Label>
                  <Select
                    value={editing.data.saltPreference}
                    onValueChange={(v) =>
                      setEditing({
                        ...editing,
                        data: { ...editing.data, saltPreference: v as "light" | "normal" | "heavy" },
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">清淡</SelectItem>
                      <SelectItem value="normal">适中</SelectItem>
                      <SelectItem value="heavy">重口</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>不爱吃的食材</Label>
                <TagsInput
                  value={editing.data.dislikes}
                  onChange={(v) =>
                    setEditing({ ...editing, data: { ...editing.data, dislikes: v } })
                  }
                  placeholder="如：香菜、芹菜"
                  suggestions={["香菜", "芹菜", "茄子", "苦瓜", "羊肉", "鱼"]}
                />
              </div>
              <div className="space-y-1.5">
                <Label>爱吃的菜</Label>
                <TagsInput
                  value={editing.data.favorites}
                  onChange={(v) =>
                    setEditing({ ...editing, data: { ...editing.data, favorites: v } })
                  }
                  placeholder="如：糖醋里脊、番茄炒蛋"
                />
              </div>
              <div className="space-y-1.5">
                <Label>过敏 / 不能吃</Label>
                <TagsInput
                  value={editing.data.allergies}
                  onChange={(v) =>
                    setEditing({ ...editing, data: { ...editing.data, allergies: v } })
                  }
                  placeholder="如：花生、海鲜"
                  suggestions={["花生", "海鲜", "牛奶", "鸡蛋", "麸质"]}
                />
              </div>
              <div className="rounded-md border p-3 space-y-3">
                <div className="text-sm font-medium">下厨能力（不下厨可留空）</div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>做饭熟练度</Label>
                    <Select
                      value={editing.data.cookingSkill ?? "none"}
                      onValueChange={(v) =>
                        setEditing({
                          ...editing,
                          data: {
                            ...editing.data,
                            cookingSkill:
                              v === "none" ? null : (v as MemberInput["cookingSkill"]),
                          },
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">不下厨</SelectItem>
                        <SelectItem value="BEGINNER">新手</SelectItem>
                        <SelectItem value="INTERMEDIATE">熟练</SelectItem>
                        <SelectItem value="ADVANCED">高手</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>可接受最高难度（1-5，可留空）</Label>
                    <Input
                      type="number"
                      min={1}
                      max={5}
                      value={editing.data.maxComplexity ?? ""}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setEditing({
                          ...editing,
                          data: {
                            ...editing.data,
                            maxComplexity: raw === "" ? null : Number(raw),
                          },
                        });
                      }}
                      placeholder="留空 = 不限"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  做饭时谁掌勺，AI 会按 ta 的熟练度调整菜单难度与时间线缓冲。
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>备注</Label>
                <Textarea
                  value={editing.data.notes ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, data: { ...editing.data, notes: e.target.value } })
                  }
                  placeholder="其他需要注意的事项"
                  rows={2}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={pending}>
              取消
            </Button>
            <Button onClick={save} disabled={pending}>
              {pending ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
