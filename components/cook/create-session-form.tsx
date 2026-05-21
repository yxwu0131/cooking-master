"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createMealSessionAction,
  type CreateSessionInput,
} from "@/lib/actions/meal-session";
import { toDatetimeLocalValue } from "@/lib/format";
import { cn } from "@/lib/utils";

const CONTEXT_OPTIONS: Array<[keyof CreateSessionInput["contextFlags"] | string, string]> = [
  ["wantQuick", "今天想省事"],
  ["wantLight", "今天想清淡"],
  ["wantHearty", "今天想下饭"],
  ["useInventory", "优先消耗冰箱食材"],
  ["noShopping", "今天不想买菜"],
  ["canShopping", "今天可以采购"],
  ["lessDishWashing", "不想洗太多锅"],
  ["moreVeggies", "让孩子多吃蔬菜"],
];

function defaultTargetTime(): Date {
  const d = new Date();
  d.setHours(18, 30, 0, 0);
  if (d.getTime() <= Date.now()) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

type MemberOption = { id: string; name: string; isChild: boolean; isElder: boolean };
type AccountOption = { id: string; name: string | null; email: string };

export function CreateSessionForm({
  members = [],
  accounts = [],
  currentUserId,
}: {
  members?: MemberOption[];
  accounts?: AccountOption[];
  currentUserId: string;
}) {
  const [pending, startTransition] = React.useTransition();
  const [data, setData] = React.useState<CreateSessionInput>({
    mealType: "DINNER",
    targetTime: defaultTargetTime(),
    maxMinutes: 60,
    eaterAdults: 2,
    eaterKids: 0,
    hasGuest: false,
    needLeftover: false,
    needLunchBox: false,
    attendingMemberIds: members.map((m) => m.id), // 默认全选
    contextFlags: {},
    notes: null,
    chefId: currentUserId,
  });

  function toggleMember(id: string) {
    setData((prev) => {
      const has = prev.attendingMemberIds.includes(id);
      return {
        ...prev,
        attendingMemberIds: has
          ? prev.attendingMemberIds.filter((x) => x !== id)
          : [...prev.attendingMemberIds, id],
      };
    });
  }

  function toggleFlag(key: string) {
    setData({
      ...data,
      contextFlags: { ...data.contextFlags, [key]: !data.contextFlags[key] },
    });
  }

  function submit() {
    startTransition(async () => {
      const result = await createMealSessionAction(data);
      if (result && !result.ok) {
        toast.error(result.error);
      }
      // 成功时 server action 会 redirect，不会走到这里
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>餐次</Label>
              <Select
                value={data.mealType}
                onValueChange={(v) =>
                  setData({ ...data, mealType: v as CreateSessionInput["mealType"] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BREAKFAST">早餐</SelectItem>
                  <SelectItem value="LUNCH">午餐</SelectItem>
                  <SelectItem value="DINNER">晚餐</SelectItem>
                  <SelectItem value="SNACK">加餐</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>目标开饭时间</Label>
              <Input
                type="datetime-local"
                value={toDatetimeLocalValue(data.targetTime)}
                onChange={(e) =>
                  setData({ ...data, targetTime: new Date(e.target.value) })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>大人数量</Label>
              <Input
                type="number"
                min={0}
                value={data.eaterAdults}
                onChange={(e) =>
                  setData({ ...data, eaterAdults: Number(e.target.value) })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>小孩数量</Label>
              <Input
                type="number"
                min={0}
                value={data.eaterKids}
                onChange={(e) =>
                  setData({ ...data, eaterKids: Number(e.target.value) })
                }
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>可接受总耗时（分钟）</Label>
              <Input
                type="number"
                min={10}
                max={240}
                value={data.maxMinutes}
                onChange={(e) =>
                  setData({ ...data, maxMinutes: Number(e.target.value) })
                }
              />
            </div>
          </div>

          {accounts.length > 1 && (
            <div className="space-y-1.5">
              <Label>今日厨师（菜单最终拍板权）</Label>
              <Select
                value={data.chefId ?? currentUserId}
                onValueChange={(v) => setData({ ...data, chefId: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {(a.name ?? a.email) + (a.id === currentUserId ? "（我）" : "")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                厨师可以推荐 / 确认菜单和开始做饭；其他家人能点菜和给反馈
              </p>
            </div>
          )}

          {members.length > 0 && (
            <div className="space-y-2">
              <Label>这一餐谁吃？（推荐会按勾选成员的口味来）</Label>
              <div className="flex flex-wrap gap-1.5">
                {members.map((m) => {
                  const selected = data.attendingMemberIds.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleMember(m.id)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-sm transition-colors",
                        selected
                          ? "bg-primary text-primary-foreground border-primary"
                          : "hover:bg-accent"
                      )}
                    >
                      {m.name}
                      {m.isChild && " 👶"}
                      {m.isElder && " 👴"}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                只勾选实际就餐的成员，AI 会避开未到场成员的偏好限制（如某人不吃辣但今天不在家）
              </p>
            </div>
          )}

          <div className="grid sm:grid-cols-3 gap-2">
            {[
              ["hasGuest", "有客人"],
              ["needLeftover", "多做留下顿"],
              ["needLunchBox", "需要带饭"],
            ].map(([key, label]) => (
              <label
                key={key}
                className="flex items-center justify-between rounded-md border px-3 py-2 cursor-pointer text-sm"
              >
                <span>{label}</span>
                <Switch
                  checked={data[key as keyof CreateSessionInput] as boolean}
                  onCheckedChange={(checked) =>
                    setData({ ...data, [key]: checked } as CreateSessionInput)
                  }
                />
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <div>
            <Label>今天的临时想法（多选）</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              系统会按这些倾向调整推荐
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {CONTEXT_OPTIONS.map(([key, label]) => (
              <label
                key={key as string}
                className="flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer text-sm hover:bg-accent"
              >
                <input
                  type="checkbox"
                  checked={data.contextFlags[key as string] === true}
                  onChange={() => toggleFlag(key as string)}
                  className="rounded"
                />
                {label}
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-1.5">
          <Label>其它说明（可选）</Label>
          <Textarea
            value={data.notes ?? ""}
            onChange={(e) => setData({ ...data, notes: e.target.value })}
            placeholder="想到什么写什么，如：今天孩子早点吃完要写作业"
            rows={2}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button onClick={submit} disabled={pending} size="lg">
          {pending ? "创建中..." : "下一步：点菜与推荐"}
        </Button>
      </div>
    </div>
  );
}
