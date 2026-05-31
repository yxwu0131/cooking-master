"use client";

import * as React from "react";
import { toast } from "sonner";
import { Pencil, X, Plus, Trash2, Save, Timer, Flame, Users, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DishImage } from "@/components/dish-image";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TagsInput } from "@/components/ui/tags-input";
import {
  updateDishRecipeAction,
  generateDishRecipeAction,
  type UpdateDishRecipeInput,
} from "@/lib/actions/dishes";

type RecipeIngredient = {
  name: string;
  quantity: number;
  unit: string;
  optional?: boolean;
};

type RecipeStep = {
  order: number;
  action: string;
  durationMinutes: number;
  stepType?: string;
  heat?: string | null;
  cookware?: string | null;
  parallel?: boolean;
};

type DishData = {
  id: string;
  name: string;
  imageUrl: string | null;
  cuisine: string | null;
  difficulty: number;
  totalMinutes: number;
  servings: number;
  tags: string[];
  isSpicy: boolean;
  isLight: boolean;
  isHearty: boolean;
  isSoup: boolean;
  isVegetarian: boolean;
  isChildFriendly: boolean;
  mainIngredients: string[];
  requiredCookware: string[];
  recipe: {
    ingredients: RecipeIngredient[];
    seasonings: RecipeIngredient[];
    steps: RecipeStep[];
    tips: string[];
    heatNotes: string | null;
  } | null;
};

const STEP_TYPES: Array<[string, string]> = [
  ["PREP", "切配"],
  ["MARINATE", "腌制"],
  ["SOAK", "泡发"],
  ["BLANCH", "焯水"],
  ["BOIL", "煮"],
  ["STEAM", "蒸"],
  ["STIR_FRY", "炒"],
  ["DEEP_FRY", "炸"],
  ["BRAISE", "炖/烧"],
  ["REDUCE", "收汁"],
  ["PLATE", "装盘"],
  ["CLEAN", "清洁"],
];

function inputFromDish(d: DishData): UpdateDishRecipeInput {
  return {
    dishId: d.id,
    cuisine: d.cuisine,
    difficulty: d.difficulty,
    totalMinutes: d.totalMinutes,
    servings: d.servings,
    isSpicy: d.isSpicy,
    isLight: d.isLight,
    isHearty: d.isHearty,
    isSoup: d.isSoup,
    isVegetarian: d.isVegetarian,
    isChildFriendly: d.isChildFriendly,
    tags: d.tags,
    mainIngredients: d.mainIngredients,
    requiredCookware: d.requiredCookware,
    ingredients: d.recipe?.ingredients ?? [],
    seasonings: d.recipe?.seasonings ?? [],
    steps:
      d.recipe?.steps && d.recipe.steps.length > 0
        ? d.recipe.steps.map((s, i) => ({
            order: s.order ?? i + 1,
            action: s.action,
            durationMinutes: s.durationMinutes,
            stepType: (s.stepType as UpdateDishRecipeInput["steps"][number]["stepType"]) ?? "PREP",
            heat: s.heat ?? null,
            cookware: s.cookware ?? null,
            parallel: s.parallel ?? false,
          }))
        : [
            {
              order: 1,
              action: "",
              durationMinutes: 5,
              stepType: "PREP",
              heat: null,
              cookware: null,
              parallel: false,
            },
          ],
    tips: d.recipe?.tips ?? [],
    heatNotes: d.recipe?.heatNotes ?? null,
  };
}

export function DishRecipeView({ dish }: { dish: DishData }) {
  const [editing, setEditing] = React.useState(false);
  const [data, setData] = React.useState<UpdateDishRecipeInput>(() => inputFromDish(dish));
  const [pending, startTransition] = React.useTransition();

  function resetAndOpen() {
    setData(inputFromDish(dish));
    setEditing(true);
  }

  function cancel() {
    setData(inputFromDish(dish));
    setEditing(false);
  }

  function save() {
    startTransition(async () => {
      const result = await updateDishRecipeAction(data);
      if (result.ok) {
        toast.success("已保存做法");
        setEditing(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  if (!editing) {
    return (
      <ViewMode dish={dish} onEdit={resetAndOpen} />
    );
  }

  return (
    <EditMode
      data={data}
      onChange={setData}
      onCancel={cancel}
      onSave={save}
      pending={pending}
    />
  );
}

function ViewMode({ dish, onEdit }: { dish: DishData; onEdit: () => void }) {
  const ingredients = dish.recipe?.ingredients ?? [];
  const seasonings = dish.recipe?.seasonings ?? [];
  const steps = (dish.recipe?.steps ?? []).slice().sort((a, b) => a.order - b.order);
  const [aiPending, startAITransition] = React.useTransition();

  function generateWithAI() {
    startAITransition(async () => {
      const result = await generateDishRecipeAction(dish.id);
      if (result.ok) {
        toast.success(`已为「${result.dishName}」生成做法`);
      } else {
        toast.error(result.error);
      }
    });
  }
  return (
    <div className="space-y-6">
      {dish.imageUrl && (
        <DishImage
          imageUrl={dish.imageUrl}
          name={dish.name}
          cuisine={dish.cuisine}
          isSoup={dish.isSoup}
          isVegetarian={dish.isVegetarian}
          className="w-full aspect-[16/10] rounded-2xl"
          sizes="(max-width: 768px) 100vw, 768px"
        />
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2 flex-1 min-w-0">
          <h1 className="text-3xl font-bold tracking-tight">{dish.name}</h1>
          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
            {dish.cuisine && <span>{dish.cuisine}</span>}
            <span className="flex items-center gap-1">
              <Timer className="size-3.5" /> {dish.totalMinutes} 分钟
            </span>
            <span className="flex items-center gap-1">
              <Flame className="size-3.5" /> 难度 {dish.difficulty}/5
            </span>
            <span className="flex items-center gap-1">
              <Users className="size-3.5" /> {dish.servings} 人份
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {dish.tags.map((t) => (
              <Badge key={t} variant="secondary">
                {t}
              </Badge>
            ))}
            {dish.isSpicy && <Badge variant="destructive">辣</Badge>}
            {dish.isChildFriendly && <Badge>儿童友好</Badge>}
            {dish.isLight && <Badge variant="outline">清淡</Badge>}
            {dish.isHearty && <Badge variant="outline">下饭</Badge>}
            {dish.isSoup && <Badge variant="outline">汤</Badge>}
            {dish.isVegetarian && <Badge variant="outline">素</Badge>}
          </div>
        </div>
        <Button onClick={onEdit} variant="outline">
          <Pencil className="size-4" />
          编辑做法
        </Button>
      </div>

      {ingredients.length === 0 && seasonings.length === 0 && steps.length === 0 ? (
        <Card className="border-primary/15 bg-gradient-to-br from-primary/8 via-accent/40 to-background">
          <CardContent className="py-10 text-center space-y-4">
            <div className="inline-flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mx-auto">
              <Sparkles className="size-6" />
            </div>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              这道菜还没有做法。让 AI 按家常思路补一份，或自己手动填。
            </p>
            <div className="flex gap-2 justify-center flex-wrap">
              <Button onClick={generateWithAI} disabled={aiPending}>
                <Sparkles className="size-4" />
                {aiPending ? "AI 生成中..." : "让 AI 生成做法"}
              </Button>
              <Button onClick={onEdit} variant="outline" disabled={aiPending}>
                <Pencil className="size-4" />
                手动添加
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>食材</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5 text-sm">
                {ingredients.map((ing, i) => (
                  <li key={i} className="flex justify-between gap-4">
                    <span>
                      {ing.name}
                      {ing.optional && (
                        <span className="text-muted-foreground ml-1">（可选）</span>
                      )}
                    </span>
                    <span className="text-muted-foreground">
                      {ing.quantity} {ing.unit}
                    </span>
                  </li>
                ))}
              </ul>
              {seasonings.length > 0 && (
                <>
                  <div className="text-xs font-semibold text-muted-foreground mt-4 mb-2">
                    调料
                  </div>
                  <ul className="space-y-1.5 text-sm">
                    {seasonings.map((s, i) => (
                      <li key={i} className="flex justify-between gap-4">
                        <span>{s.name}</span>
                        <span className="text-muted-foreground">
                          {s.quantity} {s.unit}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>步骤</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3">
                {steps.map((step) => (
                  <li key={step.order} className="flex gap-3">
                    <div className="shrink-0 size-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold">
                      {step.order}
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="text-sm">{step.action}</div>
                      <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                        <span>{step.durationMinutes} 分钟</span>
                        {step.heat && <span>· {step.heat}</span>}
                        {step.cookware && <span>· {step.cookware}</span>}
                        {step.parallel && (
                          <Badge variant="outline" className="text-xs">
                            可并行
                          </Badge>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          {dish.recipe?.tips && dish.recipe.tips.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">小贴士</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {dish.recipe.tips.map((tip, i) => (
                    <li key={i}>· {tip}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {dish.recipe?.heatNotes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">火候</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{dish.recipe.heatNotes}</p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function EditMode({
  data,
  onChange,
  onCancel,
  onSave,
  pending,
}: {
  data: UpdateDishRecipeInput;
  onChange: (d: UpdateDishRecipeInput) => void;
  onCancel: () => void;
  onSave: () => void;
  pending: boolean;
}) {
  function updateIngredient(
    list: "ingredients" | "seasonings",
    idx: number,
    patch: Partial<RecipeIngredient>
  ) {
    const next = [...data[list]];
    next[idx] = { ...next[idx], ...patch };
    onChange({ ...data, [list]: next });
  }
  function addIngredient(list: "ingredients" | "seasonings") {
    onChange({
      ...data,
      [list]: [...data[list], { name: "", quantity: 0, unit: "g" }],
    });
  }
  function removeIngredient(list: "ingredients" | "seasonings", idx: number) {
    onChange({ ...data, [list]: data[list].filter((_, i) => i !== idx) });
  }

  function updateStep(idx: number, patch: Partial<UpdateDishRecipeInput["steps"][number]>) {
    const next = [...data.steps];
    next[idx] = { ...next[idx], ...patch };
    onChange({ ...data, steps: next });
  }
  function addStep() {
    onChange({
      ...data,
      steps: [
        ...data.steps,
        {
          order: data.steps.length + 1,
          action: "",
          durationMinutes: 5,
          stepType: "PREP",
          heat: null,
          cookware: null,
          parallel: false,
        },
      ],
    });
  }
  function removeStep(idx: number) {
    onChange({
      ...data,
      steps: data.steps
        .filter((_, i) => i !== idx)
        .map((s, i) => ({ ...s, order: i + 1 })),
    });
  }
  function moveStep(idx: number, dir: -1 | 1) {
    const next = [...data.steps];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange({
      ...data,
      steps: next.map((s, i) => ({ ...s, order: i + 1 })),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between sticky top-0 bg-background pt-2 pb-2 z-10">
        <h2 className="text-lg font-semibold">编辑做法</h2>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            <X className="size-4" />
            取消
          </Button>
          <Button onClick={onSave} disabled={pending}>
            <Save className="size-4" />
            {pending ? "保存中..." : "保存"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">基础</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>菜系</Label>
              <Input
                value={data.cuisine ?? ""}
                onChange={(e) => onChange({ ...data, cuisine: e.target.value })}
                placeholder="家常菜/川菜/..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>总耗时（分钟）</Label>
              <Input
                type="number"
                min={1}
                max={360}
                value={data.totalMinutes}
                onChange={(e) =>
                  onChange({ ...data, totalMinutes: Number(e.target.value) })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>人份</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={data.servings}
                onChange={(e) => onChange({ ...data, servings: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>难度 1-5</Label>
              <Input
                type="number"
                min={1}
                max={5}
                value={data.difficulty}
                onChange={(e) =>
                  onChange({ ...data, difficulty: Number(e.target.value) })
                }
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>主要食材（用于库存匹配）</Label>
            <TagsInput
              value={data.mainIngredients}
              onChange={(v) => onChange({ ...data, mainIngredients: v })}
              placeholder="番茄、牛腩"
            />
          </div>
          <div className="space-y-1.5">
            <Label>必需厨具</Label>
            <TagsInput
              value={data.requiredCookware}
              onChange={(v) => onChange({ ...data, requiredCookware: v })}
              placeholder="炒锅、汤锅"
              suggestions={["炒锅", "汤锅", "蒸锅", "电饭锅", "高压锅", "砂锅"]}
            />
          </div>
          <div className="space-y-1.5">
            <Label>标签</Label>
            <TagsInput
              value={data.tags}
              onChange={(v) => onChange({ ...data, tags: v })}
              placeholder="下饭、家常、红烧..."
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              ["isSpicy", "辣"],
              ["isLight", "清淡"],
              ["isHearty", "下饭"],
              ["isSoup", "汤"],
              ["isVegetarian", "素"],
              ["isChildFriendly", "儿童友好"],
            ].map(([key, label]) => (
              <label
                key={key}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm cursor-pointer"
              >
                <span>{label}</span>
                <Switch
                  checked={data[key as keyof UpdateDishRecipeInput] as boolean}
                  onCheckedChange={(checked) =>
                    onChange({ ...data, [key]: checked } as UpdateDishRecipeInput)
                  }
                />
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      <IngredientsEditor
        title="食材"
        list={data.ingredients}
        onAdd={() => addIngredient("ingredients")}
        onRemove={(i) => removeIngredient("ingredients", i)}
        onPatch={(i, p) => updateIngredient("ingredients", i, p)}
        showOptional
      />
      <IngredientsEditor
        title="调料"
        list={data.seasonings}
        onAdd={() => addIngredient("seasonings")}
        onRemove={(i) => removeIngredient("seasonings", i)}
        onPatch={(i, p) => updateIngredient("seasonings", i, p)}
      />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">步骤</CardTitle>
            <Button size="sm" variant="outline" onClick={addStep}>
              <Plus className="size-3.5" />
              加步骤
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.steps.map((step, idx) => (
            <div key={idx} className="rounded-md border p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="size-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold">
                  {idx + 1}
                </div>
                <Select
                  value={step.stepType ?? "PREP"}
                  onValueChange={(v) =>
                    updateStep(idx, {
                      stepType: v as UpdateDishRecipeInput["steps"][number]["stepType"],
                    })
                  }
                >
                  <SelectTrigger className="w-[110px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STEP_TYPES.map(([v, lab]) => (
                      <SelectItem key={v} value={v}>
                        {lab}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex-1" />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => moveStep(idx, -1)}
                  disabled={idx === 0}
                  title="上移"
                >
                  ↑
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => moveStep(idx, 1)}
                  disabled={idx === data.steps.length - 1}
                  title="下移"
                >
                  ↓
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => removeStep(idx)}
                  disabled={data.steps.length === 1}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              <Textarea
                value={step.action}
                onChange={(e) => updateStep(idx, { action: e.target.value })}
                placeholder="步骤描述"
                rows={2}
              />
              <div className="grid sm:grid-cols-4 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">耗时（分钟）</Label>
                  <Input
                    type="number"
                    min={1}
                    max={360}
                    value={step.durationMinutes}
                    onChange={(e) =>
                      updateStep(idx, { durationMinutes: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">火候</Label>
                  <Input
                    value={step.heat ?? ""}
                    onChange={(e) =>
                      updateStep(idx, { heat: e.target.value || null })
                    }
                    placeholder="大火/中火/小火"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">厨具</Label>
                  <Input
                    value={step.cookware ?? ""}
                    onChange={(e) =>
                      updateStep(idx, { cookware: e.target.value || null })
                    }
                    placeholder="炒锅..."
                  />
                </div>
                <label className="flex items-end justify-between rounded-md border px-3 py-2 text-sm cursor-pointer">
                  <span>可并行</span>
                  <Switch
                    checked={step.parallel ?? false}
                    onCheckedChange={(c) => updateStep(idx, { parallel: c })}
                  />
                </label>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">小贴士 / 火候说明</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>小贴士</Label>
            <TagsInput
              value={data.tips}
              onChange={(v) => onChange({ ...data, tips: v })}
              placeholder="每条 1 句话，回车添加"
            />
          </div>
          <div className="space-y-1.5">
            <Label>火候说明</Label>
            <Textarea
              value={data.heatNotes ?? ""}
              onChange={(e) =>
                onChange({ ...data, heatNotes: e.target.value || null })
              }
              rows={2}
              placeholder="如：全程小火慢炖，最后大火收汁"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          取消
        </Button>
        <Button onClick={onSave} disabled={pending}>
          <Save className="size-4" />
          {pending ? "保存中..." : "保存"}
        </Button>
      </div>
    </div>
  );
}

function IngredientsEditor({
  title,
  list,
  onAdd,
  onRemove,
  onPatch,
  showOptional,
}: {
  title: string;
  list: RecipeIngredient[];
  onAdd: () => void;
  onRemove: (idx: number) => void;
  onPatch: (idx: number, patch: Partial<RecipeIngredient>) => void;
  showOptional?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <Button size="sm" variant="outline" onClick={onAdd}>
            <Plus className="size-3.5" />
            加一项
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {list.length === 0 && (
          <p className="text-xs text-muted-foreground">空</p>
        )}
        {list.map((ing, i) => (
          <div key={i} className="grid grid-cols-[1fr_80px_80px_auto] sm:grid-cols-[1fr_100px_80px_auto_auto] gap-2 items-center">
            <Input
              value={ing.name}
              onChange={(e) => onPatch(i, { name: e.target.value })}
              placeholder="名称"
            />
            <Input
              type="number"
              min={0}
              step="0.1"
              value={ing.quantity}
              onChange={(e) => onPatch(i, { quantity: Number(e.target.value) })}
              placeholder="量"
            />
            <Input
              value={ing.unit}
              onChange={(e) => onPatch(i, { unit: e.target.value })}
              placeholder="g/个/把"
            />
            {showOptional ? (
              <label className="flex items-center gap-1 text-xs">
                <Switch
                  checked={ing.optional ?? false}
                  onCheckedChange={(c) => onPatch(i, { optional: c })}
                />
                可选
              </label>
            ) : (
              <div />
            )}
            <Button size="icon" variant="ghost" onClick={() => onRemove(i)}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
