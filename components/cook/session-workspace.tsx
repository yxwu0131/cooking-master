"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Sparkles,
  CheckCircle2,
  Clock,
  Users,
  Timer,
  AlertTriangle,
  ChefHat,
  Pencil,
  X,
  Search,
  Flame,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  addMealRequestAction,
  removeMealRequestAction,
  cancelSessionAction,
} from "@/lib/actions/meal-session";
import {
  generateMenuPlansAction,
  selectMenuPlanAction,
  addDishToMenuAction,
  removeMenuDishAction,
  finalizeMenuAction,
  startCookingAction,
  finishCookingAction,
} from "@/lib/actions/menu";
import { cn } from "@/lib/utils";
import { formatLocal, formatTime } from "@/lib/format";
import { FeedbackSection } from "@/components/cook/feedback-section";
import type { PrepPlan, PrepGroup } from "@/lib/planning/prep-consolidation";

type Session = {
  id: string;
  mealType: string;
  targetTime: Date;
  maxMinutes: number;
  eaterAdults: number;
  eaterKids: number;
  hasGuest: boolean;
  status: string;
  chefId: string;
  chef: { id: string; name: string | null; email: string } | null;
  contextFlags: unknown;
  notes: string | null;
  requests: Array<{
    id: string;
    type: string;
    content: string;
    status: string;
    authorUser: { name: string | null } | null;
    member: { name: string } | null;
  }>;
  menus: Array<{
    id: string;
    tag: string | null;
    strategy: string;
    status: string;
    reasoning: string | null;
    totalMinutes: number | null;
    difficulty: number | null;
    risks: string[];
    dishes: Array<{
      id: string;
      dishId: string;
      dishNameSnapshot: string;
      position: number;
      usedInventory: unknown;
      missingIngredients: unknown;
      dish: {
        cuisine: string | null;
        difficulty: number;
        totalMinutes: number;
        isSoup: boolean;
        isStaple: boolean;
        recipe: {
          ingredients: unknown;
          seasonings: unknown;
          steps: unknown;
          tips: string[];
          heatNotes: string | null;
        } | null;
      } | null;
    }>;
    shoppingList: {
      id: string;
      items: Array<{
        id: string;
        name: string;
        quantity: number;
        unit: string;
        area: string;
        isHave: boolean;
        isOptional: boolean;
        isChecked: boolean;
      }>;
    } | null;
    cookingPlan: {
      id: string;
      totalMinutes: number;
      strategy: string;
      warnings: string[];
      startAt: Date;
      endAt: Date;
      prepPlan: unknown; // Prisma JsonValue；在 TimelineView 里 cast 成 PrepPlan
      steps: Array<{
        order: number;
        startMinute: number;
        durationMinutes: number;
        action: string;
        dishName: string | null;
        cookware: string | null;
        heat: string | null;
        isParallel: boolean;
        reminders: string[];
        stepType: string | null;
      }>;
    } | null;
  }>;
};

type Member = {
  id: string;
  name: string;
};

type DishMeta = {
  id: string;
  name: string;
  cuisine: string | null;
  difficulty: number;
  totalMinutes: number;
  isSpicy: boolean;
  isLight: boolean;
  isSoup: boolean;
  isStaple: boolean;
  isVegetarian: boolean;
  isChildFriendly: boolean;
};

const MEAL_TYPE_LABEL: Record<string, string> = {
  BREAKFAST: "早餐",
  LUNCH: "午餐",
  DINNER: "晚餐",
  SNACK: "加餐",
};

const STRATEGY_LABEL: Record<string, string> = {
  BALANCED: "综合平衡",
  SATISFY_REQUESTS: "满足家人点菜",
  USE_INVENTORY: "优先消耗冰箱",
  QUICK: "省时快手",
  KID_FRIENDLY: "孩子友好",
  WEEKEND_TREAT: "周末改善",
};

const AREA_LABEL: Record<string, string> = {
  VEGETABLE: "蔬菜区",
  MEAT: "肉类区",
  SEAFOOD: "水产区",
  SOY: "豆制品区",
  DRY_GOODS: "干货调料区",
  GRAIN: "主食区",
  DAIRY: "蛋奶冷藏区",
  FROZEN: "冷冻区",
  OTHER: "其他",
};

export function SessionWorkspace({
  session,
  members,
  currentUserId,
  allDishes,
}: {
  session: Session;
  members: Member[];
  currentUserId: string;
  allDishes: DishMeta[];
}) {
  const draftMenus = session.menus.filter((m) => m.status === "DRAFT");
  const editingMenu = session.menus.find((m) => m.status === "EDITING");
  const confirmedMenu = session.menus.find((m) => m.status === "CONFIRMED");
  const isChef = session.chefId === currentUserId;

  return (
    <div className="space-y-4">
      <SessionHeader session={session} isChef={isChef} />

      {(session.status === "DRAFTING" || session.status === "PLANNING") && !confirmedMenu && (
        <RequestsSection sessionId={session.id} requests={session.requests} members={members} />
      )}

      {session.status === "DRAFTING" && !editingMenu && !confirmedMenu && (
        <GenerateMenuSection sessionId={session.id} isChef={isChef} />
      )}

      {!editingMenu && !confirmedMenu && (session.status === "PLANNING" || draftMenus.length > 0) && (
        <DraftPlansSection sessionId={session.id} plans={draftMenus} isChef={isChef} />
      )}

      {editingMenu && !confirmedMenu && (
        <EditingMenuSection
          menu={editingMenu}
          isChef={isChef}
          allDishes={allDishes}
        />
      )}

      {confirmedMenu && (
        <ConfirmedMenuView session={session} menu={confirmedMenu} isChef={isChef} />
      )}

      {confirmedMenu && (session.status === "DONE" || session.status === "COOKING") && (
        <FeedbackSection
          sessionId={session.id}
          menuId={confirmedMenu.id}
          dishes={confirmedMenu.dishes.map((d) => ({
            id: d.id,
            dishId: d.dishId,
            dishNameSnapshot: d.dishNameSnapshot,
          }))}
        />
      )}
    </div>
  );
}

function SessionHeader({ session, isChef }: { session: Session; isChef: boolean }) {
  const flags = (session.contextFlags as Record<string, boolean>) ?? {};
  const flagsList = Object.entries(flags).filter(([, v]) => v);
  const chefName = session.chef?.name ?? session.chef?.email ?? "未知";

  async function onCancel() {
    if (!confirm("取消这次做饭？")) return;
    const result = await cancelSessionAction(session.id);
    if (result && !result.ok) {
      toast.error(result.error);
    }
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">
              {MEAL_TYPE_LABEL[session.mealType]}规划
            </h1>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <ChefHat className="size-3.5" />
                厨师：{chefName}
                {isChef && (
                  <Badge variant="secondary" className="text-[10px] py-0 px-1.5 ml-1">
                    我
                  </Badge>
                )}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" />
                {formatLocal(session.targetTime)}
                开饭
              </span>
              <span className="inline-flex items-center gap-1">
                <Users className="size-3.5" />
                {session.eaterAdults}大 + {session.eaterKids}小
                {session.hasGuest && " + 客"}
              </span>
              <span className="inline-flex items-center gap-1">
                <Timer className="size-3.5" />
                ≤ {session.maxMinutes} 分钟
              </span>
            </div>
          </div>
          {!["DONE", "CANCELLED"].includes(session.status) && isChef && (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              取消
            </Button>
          )}
        </div>
        {flagsList.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {flagsList.map(([k]) => (
              <Badge key={k} variant="secondary" className="text-xs">
                {flagLabel(k)}
              </Badge>
            ))}
          </div>
        )}
        {session.notes && (
          <p className="text-sm text-muted-foreground border-l-2 pl-3">
            {session.notes}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function flagLabel(k: string): string {
  const m: Record<string, string> = {
    wantQuick: "想省事",
    wantLight: "想清淡",
    wantHearty: "想下饭",
    useInventory: "用冰箱",
    noShopping: "不买菜",
    canShopping: "可采购",
    lessDishWashing: "少洗锅",
    moreVeggies: "多蔬菜",
  };
  return m[k] ?? k;
}

function RequestsSection({
  sessionId,
  requests,
  members,
}: {
  sessionId: string;
  requests: Session["requests"];
  members: Member[];
}) {
  const [type, setType] = React.useState<"SPECIFIC_DISH" | "FUZZY">("SPECIFIC_DISH");
  const [content, setContent] = React.useState("");
  const [memberId, setMemberId] = React.useState<string>("self");
  const [pending, startTransition] = React.useTransition();

  function add() {
    if (!content.trim()) return;
    startTransition(async () => {
      const result = await addMealRequestAction({
        sessionId,
        type,
        content: content.trim(),
        memberId: memberId === "self" ? null : memberId,
      });
      if (result.ok) {
        setContent("");
        toast.success("已记录");
      } else {
        toast.error(result.error);
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await removeMealRequestAction(id);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">家人点菜或表达偏好</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <Select value={type} onValueChange={(v) => setType(v as "SPECIFIC_DISH" | "FUZZY")}>
            <SelectTrigger className="sm:w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SPECIFIC_DISH">具体菜</SelectItem>
              <SelectItem value="FUZZY">模糊偏好</SelectItem>
            </SelectContent>
          </Select>
          <Select value={memberId} onValueChange={setMemberId}>
            <SelectTrigger className="sm:w-[130px]">
              <SelectValue placeholder="谁说的" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="self">我（厨师）</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={
              type === "SPECIFIC_DISH"
                ? "如：番茄炒蛋 / 红烧排骨"
                : "如：想吃肉 / 想喝汤 / 想吃清淡的"
            }
            onKeyDown={(e) => e.key === "Enter" && add()}
            className="flex-1"
          />
          <Button onClick={add} disabled={pending || !content.trim()}>
            <Plus className="size-4" />
            添加
          </Button>
        </div>
        {requests.length > 0 ? (
          <div className="space-y-1.5">
            {requests.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 text-sm"
              >
                <Badge variant="outline" className="text-xs">
                  {r.type === "SPECIFIC_DISH" ? "具体" : "模糊"}
                </Badge>
                <span className="flex-1">{r.content}</span>
                <span className="text-xs text-muted-foreground">
                  {r.member?.name ?? r.authorUser?.name ?? "厨师"}
                </span>
                <Button variant="ghost" size="icon" onClick={() => remove(r.id)}>
                  <Trash2 className="size-3" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            没有点菜也没关系，下一步直接让厨神推荐。
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function GenerateMenuSection({ sessionId, isChef }: { sessionId: string; isChef: boolean }) {
  const [pending, startTransition] = React.useTransition();

  function generate() {
    startTransition(async () => {
      const t = toast.loading("AI 正在分析家庭档案、库存和点菜...");
      const result = await generateMenuPlansAction(sessionId);
      toast.dismiss(t);
      if (result.ok) {
        toast.success(`生成了 ${result.count} 套方案`);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="pt-6 flex flex-col items-center text-center space-y-3">
        <div className="rounded-full bg-primary/10 p-3">
          <Sparkles className="size-6 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold">让厨神推荐菜单</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isChef
              ? "根据家庭档案、当前食材、点菜和今天的条件，生成 2-3 套方案"
              : "等当日厨师拍板推荐菜单；你可以先在上面点菜"}
          </p>
        </div>
        <Button onClick={generate} disabled={pending || !isChef} size="lg">
          {pending ? "推荐中..." : isChef ? "AI 推荐菜单" : "仅厨师可推荐"}
        </Button>
      </CardContent>
    </Card>
  );
}

function DraftPlansSection({
  sessionId,
  plans,
  isChef,
}: {
  sessionId: string;
  plans: Session["menus"];
  isChef: boolean;
}) {
  const [pending, startTransition] = React.useTransition();

  function selectPlan(menuId: string) {
    startTransition(async () => {
      const result = await selectMenuPlanAction(menuId);
      if (result.ok) toast.success("已选定这套方案，下面可以调整菜单");
      else toast.error(result.error);
    });
  }

  function regenerate() {
    startTransition(async () => {
      const t = toast.loading("重新生成方案...");
      const result = await generateMenuPlansAction(sessionId);
      toast.dismiss(t);
      if (result.ok) toast.success("已重新生成");
      else toast.error(result.error);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">推荐方案（{plans.length} 套）</h2>
        {isChef && (
          <Button variant="outline" size="sm" onClick={regenerate} disabled={pending}>
            <Sparkles className="size-3.5" />
            重新推荐
          </Button>
        )}
      </div>
      {!isChef && (
        <p className="text-xs text-muted-foreground">
          等当日厨师从下面选定方案；你可以继续在上方点菜调整
        </p>
      )}
      <div className="grid lg:grid-cols-2 gap-4">
        {plans.map((plan) => (
          <Card key={plan.id} className="flex flex-col">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">
                  {plan.tag ?? STRATEGY_LABEL[plan.strategy]}
                </CardTitle>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{plan.totalMinutes} 分钟</span>
                  <span>难度 {plan.difficulty}/5</span>
                </div>
              </div>
              {plan.reasoning && (
                <p className="text-xs text-muted-foreground">{plan.reasoning}</p>
              )}
            </CardHeader>
            <CardContent className="flex-1 space-y-3">
              <div className="space-y-2">
                {plan.dishes.map((d) => {
                  const used = d.usedInventory as string[] | null;
                  const missing = d.missingIngredients as Array<{
                    name: string;
                    quantity: number;
                    unit: string;
                  }> | null;
                  return (
                    <div key={d.id} className="text-sm border-l-2 border-primary/40 pl-3">
                      <div className="font-medium">{d.dishNameSnapshot}</div>
                      {used && used.length > 0 && (
                        <div className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
                          ✓ 用到：{used.join("、")}
                        </div>
                      )}
                      {missing && missing.length > 0 && (
                        <div className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                          需买：{missing.map((m) => `${m.name} ${m.quantity}${m.unit}`).join("、")}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {plan.risks.length > 0 && (
                <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 p-2 text-xs">
                  <div className="flex items-center gap-1 font-medium text-amber-900 dark:text-amber-100 mb-1">
                    <AlertTriangle className="size-3" />
                    注意
                  </div>
                  <ul className="space-y-0.5 text-amber-800 dark:text-amber-200">
                    {plan.risks.map((r, i) => (
                      <li key={i}>· {r}</li>
                    ))}
                  </ul>
                </div>
              )}
              <Button
                onClick={() => selectPlan(plan.id)}
                disabled={pending || !isChef}
                className="w-full mt-auto"
              >
                <Pencil className="size-4" />
                {isChef ? "选这套，进入调整" : "仅厨师可选定"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function EditingMenuSection({
  menu,
  isChef,
  allDishes,
}: {
  menu: Session["menus"][number];
  isChef: boolean;
  allDishes: DishMeta[];
}) {
  const [pending, startTransition] = React.useTransition();
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const currentDishIds = new Set(menu.dishes.map((d) => d.dishId));
  const candidates = React.useMemo(() => {
    const term = search.trim();
    return allDishes.filter((d) => {
      if (currentDishIds.has(d.id)) return false;
      if (term && !d.name.includes(term) && !(d.cuisine ?? "").includes(term)) return false;
      return true;
    }).slice(0, 50);
  }, [allDishes, currentDishIds, search]);

  function addDish(dishId: string) {
    startTransition(async () => {
      const r = await addDishToMenuAction(menu.id, dishId);
      if (r.ok) toast.success("已加入");
      else toast.error(r.error);
    });
  }

  function removeDish(menuDishId: string) {
    startTransition(async () => {
      const r = await removeMenuDishAction(menuDishId);
      if (r.ok) toast.success("已移除");
      else toast.error(r.error);
    });
  }

  function finalize() {
    startTransition(async () => {
      const t = toast.loading("最终确认菜单、生成采购清单和时间线...");
      const r = await finalizeMenuAction(menu.id);
      toast.dismiss(t);
      if (r.ok) toast.success("菜单已确认！下面是采购清单和时间线");
      else toast.error(r.error);
    });
  }

  const hasStaple = menu.dishes.some((d) =>
    /米饭|面条|馒头|饺子|包子|粥|米粉|河粉|馄饨|面包/.test(d.dishNameSnapshot)
  );

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">
            正在调整菜单 · {menu.tag ?? STRATEGY_LABEL[menu.strategy]}
          </CardTitle>
          <Badge variant="secondary" className="text-xs">
            {menu.dishes.length} 道菜
          </Badge>
        </div>
        {menu.reasoning && (
          <p className="text-xs text-muted-foreground">{menu.reasoning}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {!hasStaple && (
          <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-300 p-2 text-xs text-amber-900 dark:text-amber-100">
            还没主食，记得加米饭/面条/馒头等
          </div>
        )}

        <div className="space-y-1.5">
          {menu.dishes.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="truncate">{d.dishNameSnapshot}</span>
              </div>
              {isChef && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => removeDish(d.id)}
                  disabled={pending}
                  title="从菜单中移除"
                >
                  <X className="size-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>

        {isChef && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPickerOpen((v) => !v)}
              disabled={pending}
              className="w-full"
            >
              <Plus className="size-3.5" />
              从菜品库添加
            </Button>

            {pickerOpen && (
              <div className="rounded-md border p-3 space-y-2">
                <div className="relative">
                  <Search className="size-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="搜菜名或菜系..."
                    className="pl-7 h-8 text-sm"
                  />
                </div>
                <div className="max-h-60 overflow-y-auto space-y-1">
                  {candidates.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      没有匹配菜品
                    </p>
                  )}
                  {candidates.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => addDish(d.id)}
                      disabled={pending}
                      className="w-full text-left rounded px-2 py-1.5 text-sm hover:bg-accent flex items-center justify-between gap-2"
                    >
                      <span>{d.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {d.cuisine ?? "家常"} · {d.totalMinutes}分钟 · 难{d.difficulty}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button onClick={finalize} disabled={pending || menu.dishes.length === 0}>
                <CheckCircle2 className="size-4" />
                最终确认 · 生成时间线
              </Button>
            </div>
          </>
        )}
        {!isChef && (
          <p className="text-xs text-muted-foreground">等当日厨师调整菜单并最终确认</p>
        )}
      </CardContent>
    </Card>
  );
}

function ConfirmedMenuView({
  session,
  menu,
  isChef,
}: {
  session: Session;
  menu: NonNullable<Session["menus"][number]>;
  isChef: boolean;
}) {
  const [pending, startTransition] = React.useTransition();

  function startCooking() {
    startTransition(async () => {
      const result = await startCookingAction(session.id);
      if (result.ok) toast.success("开始做饭！按时间线执行");
      else toast.error(result.error);
    });
  }

  function finish() {
    startTransition(async () => {
      const result = await finishCookingAction(session.id);
      if (result.ok) toast.success("已完成，记得给反馈让推荐更准");
      else toast.error(result.error);
    });
  }

  return (
    <div className="space-y-4">
      <Card className="bg-primary/5 border-primary/30">
        <CardContent className="pt-6 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-primary" />
            <h2 className="text-lg font-semibold">
              已确认菜单 · {menu.tag ?? STRATEGY_LABEL[menu.strategy]}
            </h2>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            {menu.dishes.map((d) => (
              <Badge key={d.id} className="text-sm py-1 px-3">
                {d.dishNameSnapshot}
              </Badge>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            {session.status === "CONFIRMED" && (
              <Button onClick={startCooking} disabled={pending || !isChef}>
                <ChefHat className="size-4" />
                {isChef ? "开始做饭" : "等厨师开始做饭"}
              </Button>
            )}
            {session.status === "COOKING" && (
              <Button onClick={finish} disabled={pending || !isChef}>
                <CheckCircle2 className="size-4" />
                {isChef ? "做饭完成" : "等厨师完成"}
              </Button>
            )}
            {session.status === "DONE" && (
              <Button variant="outline" disabled>
                <CheckCircle2 className="size-4" />
                已完成
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="timeline">
        <TabsList>
          <TabsTrigger value="timeline">做饭时间线</TabsTrigger>
          <TabsTrigger value="shopping">采购清单</TabsTrigger>
        </TabsList>
        <TabsContent value="timeline" className="mt-4">
          <TimelineView plan={menu.cookingPlan} menuDishes={menu.dishes} />
        </TabsContent>
        <TabsContent value="shopping" className="mt-4">
          <ShoppingListView list={menu.shoppingList} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// 两阶段做饭模型：备菜统一准备 → 烹饪。
// 备菜阶段的步骤类型（这些不进烹饪时间线，统一在「备菜」阶段一次性完成）
const PREP_STEP_TYPES = new Set(["PREP", "MARINATE", "SOAK", "BLANCH", "CLEAN"]);

type RecipeIngLite = { name: string; quantity?: number; unit?: string; optional?: boolean };
type RecipeStepLite = {
  order?: number;
  action: string;
  durationMinutes?: number;
  stepType?: string;
  heat?: string;
  cookware?: string;
};

function asIngList(v: unknown): RecipeIngLite[] {
  return Array.isArray(v) ? (v as RecipeIngLite[]) : [];
}
function asStepList(v: unknown): RecipeStepLite[] {
  return Array.isArray(v) ? (v as RecipeStepLite[]) : [];
}

type CookGroup = {
  dishName: string;
  steps: NonNullable<Session["menus"][number]["cookingPlan"]>["steps"];
  startMinute: number;
  endMinute: number;
};

type MenuDishRecipe = NonNullable<Session["menus"][number]["dishes"][number]["dish"]>["recipe"];

/** 烹饪阶段：每道菜一张卡，展示下锅时间 + 时间线动作 + 可展开的完整菜谱详情 */
function DishCookCard({ group, recipe }: { group: CookGroup; recipe: MenuDishRecipe | null }) {
  const [open, setOpen] = React.useState(false);
  const ings = asIngList(recipe?.ingredients);
  const seas = asIngList(recipe?.seasonings);
  const fullSteps = asStepList(recipe?.steps);
  const tips = recipe?.tips ?? [];
  const hasRecipe = ings.length > 0 || fullSteps.length > 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm flex items-center gap-2">
            <Flame className="size-4 text-orange-500" />
            {group.dishName}
          </CardTitle>
          <span className="text-xs text-muted-foreground font-mono">
            第 {group.startMinute}~{group.endMinute} 分钟
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <ol className="relative border-l border-border ml-3 space-y-2.5">
          {group.steps.map((s) => (
            <li key={s.order} className="ml-5 relative">
              <span className="absolute -left-[1.85rem] top-0 size-5 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 text-[10px] font-semibold flex items-center justify-center">
                {s.startMinute}
              </span>
              <p className="text-sm">{s.action}</p>
              <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                <span>{s.durationMinutes} 分钟</span>
                {s.cookware && <span>· {s.cookware}</span>}
                {s.heat && <span>· {s.heat}</span>}
              </div>
              {s.reminders.length > 0 && (
                <div className="text-xs text-amber-700 dark:text-amber-400">
                  💡 {s.reminders.join("；")}
                </div>
              )}
            </li>
          ))}
        </ol>

        {hasRecipe && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1 text-xs text-primary hover:underline pt-1"
          >
            {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            {open ? "收起菜谱详情" : "查看完整菜谱（食材 / 调料 / 做法）"}
          </button>
        )}

        {open && hasRecipe && (
          <div className="rounded-md bg-muted/40 p-3 space-y-3 text-sm">
            {(ings.length > 0 || seas.length > 0) && (
              <div className="grid gap-3 sm:grid-cols-2">
                {ings.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">食材</div>
                    <ul className="space-y-0.5">
                      {ings.map((it, i) => (
                        <li key={i} className="flex justify-between gap-2">
                          <span>
                            {it.name}
                            {it.optional ? "（可选）" : ""}
                          </span>
                          <span className="text-muted-foreground font-mono text-xs">
                            {it.quantity ?? ""}
                            {it.unit ?? ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {seas.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">调料</div>
                    <ul className="space-y-0.5">
                      {seas.map((it, i) => (
                        <li key={i} className="flex justify-between gap-2">
                          <span>{it.name}</span>
                          <span className="text-muted-foreground font-mono text-xs">
                            {it.quantity ?? ""}
                            {it.unit ?? ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {fullSteps.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">详细做法</div>
                <ol className="space-y-1 list-decimal list-inside">
                  {fullSteps.map((st, i) => (
                    <li key={i}>
                      {st.action}
                      {(st.heat || st.cookware) && (
                        <span className="text-xs text-muted-foreground">
                          {" "}
                          （{[st.cookware, st.heat].filter(Boolean).join(" · ")}）
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {tips.length > 0 && (
              <div className="text-xs text-amber-700 dark:text-amber-400">
                💡 {tips.join("；")}
              </div>
            )}
            {recipe?.heatNotes && (
              <div className="text-xs text-muted-foreground">🔥 火候：{recipe.heatNotes}</div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TimelineView({
  plan,
  menuDishes,
}: {
  plan: Session["menus"][number]["cookingPlan"];
  menuDishes: Session["menus"][number]["dishes"];
}) {
  if (!plan) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          时间线生成中...
        </CardContent>
      </Card>
    );
  }

  const prepPlan = (plan.prepPlan ?? null) as PrepPlan | null;
  const recipeByName = new Map(
    menuDishes.map((md) => [md.dishNameSnapshot, md.dish?.recipe ?? null])
  );

  // 备菜阶段：统一一次性准备。优先用跨菜合并清单（按食材聚合），
  // 没有则回退到 plan 里的备菜类步骤逐条列出。
  const prepGroups: PrepGroup[] = prepPlan?.groups ?? [];
  const prepFallback = prepGroups.length
    ? []
    : plan.steps
        .filter((s) => PREP_STEP_TYPES.has(s.stepType ?? ""))
        .slice()
        .sort((a, b) => a.startMinute - b.startMinute);

  // 烹饪阶段：排除备菜类步骤，按菜分组，每道菜按下锅时间排序
  const cookGroupMap = new Map<string, NonNullable<typeof plan>["steps"]>();
  for (const s of plan.steps) {
    if (PREP_STEP_TYPES.has(s.stepType ?? "")) continue;
    const key = s.dishName ?? "其他";
    if (!cookGroupMap.has(key)) cookGroupMap.set(key, []);
    cookGroupMap.get(key)!.push(s);
  }
  const cookGroups: CookGroup[] = [...cookGroupMap.entries()]
    .map(([dishName, steps]) => {
      const sorted = steps.slice().sort((a, b) => a.startMinute - b.startMinute);
      return {
        dishName,
        steps: sorted,
        startMinute: sorted[0]?.startMinute ?? 0,
        endMinute: Math.max(...sorted.map((s) => s.startMinute + s.durationMinutes)),
      };
    })
    .sort((a, b) => a.startMinute - b.startMinute);

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="pt-6 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Timer className="size-4 text-primary" />
            <span className="font-medium">总耗时：{plan.totalMinutes} 分钟</span>
            <span className="text-muted-foreground">
              · 建议 {formatTime(plan.startAt)} 开始做
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{plan.strategy}</p>
          {plan.warnings.length > 0 && (
            <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 p-2 text-xs">
              <div className="flex items-center gap-1 font-medium text-amber-900 dark:text-amber-100 mb-1">
                <AlertTriangle className="size-3" />
                注意
              </div>
              <ul className="space-y-0.5 text-amber-800 dark:text-amber-200">
                {plan.warnings.map((w, i) => (
                  <li key={i}>· {w}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 阶段一 · 备菜（统一一次性准备） */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <span className="size-5 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center">
              1
            </span>
            备菜 · 统一准备
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            所有菜的洗切、腌制、泡发一次性做完，再开火——别做一道切一道
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {prepPlan?.aiHint && (
            <div className="rounded-md bg-primary/5 p-2 text-xs">
              <div className="flex items-center gap-1 font-medium text-primary mb-1">
                <Sparkles className="size-3" />
                统筹备菜建议
              </div>
              <p className="text-muted-foreground leading-relaxed">{prepPlan.aiHint}</p>
            </div>
          )}
          {prepGroups.length > 0 ? (
            prepGroups.map((g) => (
              <div key={g.kind} className="space-y-2">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-sm font-medium">{g.title}</span>
                  <span className="text-xs text-muted-foreground">{g.hint}</span>
                </div>
                <ul className="space-y-1.5">
                  {g.items.map((it, i) => (
                    <li
                      key={i}
                      className="flex items-baseline gap-2 flex-wrap text-sm border-l-2 border-primary/30 pl-2"
                    >
                      <span className="font-medium">{it.ingredient}</span>
                      {it.totalText && (
                        <span className="text-xs text-muted-foreground font-mono">
                          {it.totalText}
                        </span>
                      )}
                      {it.forDishes.length > 0 && (
                        <span className="flex flex-wrap gap-1">
                          {it.forDishes.map((fd, j) => (
                            <Badge key={j} variant="outline" className="text-xs font-normal">
                              {fd.dish}
                              {fd.amount ? ` ${fd.amount}` : ""}
                            </Badge>
                          ))}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          ) : prepFallback.length > 0 ? (
            <ul className="space-y-1.5">
              {prepFallback.map((s) => (
                <li key={s.order} className="text-sm border-l-2 border-primary/30 pl-2">
                  <span className="font-medium">{s.dishName}</span>
                  <span className="text-muted-foreground"> · {s.action}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">这餐无需提前备菜，直接开火即可</p>
          )}
        </CardContent>
      </Card>

      {/* 阶段二 · 烹饪（按下锅顺序，每道菜一张卡 + 完整菜谱） */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <span className="size-5 rounded-full bg-orange-500/15 text-orange-600 dark:text-orange-400 text-xs font-semibold flex items-center justify-center">
            2
          </span>
          <span className="text-sm font-medium">烹饪 · 按下锅顺序</span>
          <span className="text-xs text-muted-foreground">
            先开不占手的（饭/炖/蒸），叶菜和汤压轴；点开看完整做法
          </span>
        </div>
        {cookGroups.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              暂无烹饪步骤
            </CardContent>
          </Card>
        ) : (
          cookGroups.map((g) => (
            <DishCookCard key={g.dishName} group={g} recipe={recipeByName.get(g.dishName) ?? null} />
          ))
        )}
      </div>
    </div>
  );
}

function ShoppingListView({ list }: { list: Session["menus"][number]["shoppingList"] }) {
  const [pending, startTransition] = React.useTransition();

  if (!list) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          采购清单生成中...
        </CardContent>
      </Card>
    );
  }

  // 分两栏：需购买 & 冰箱已有
  const toBuy = list.items.filter((i) => !i.isHave);
  const haveItems = list.items.filter((i) => i.isHave);

  const groupedToBuy = new Map<string, typeof list.items>();
  for (const item of toBuy) {
    if (!groupedToBuy.has(item.area)) groupedToBuy.set(item.area, []);
    groupedToBuy.get(item.area)!.push(item);
  }
  const groupedHave = new Map<string, typeof list.items>();
  for (const item of haveItems) {
    if (!groupedHave.has(item.area)) groupedHave.set(item.area, []);
    groupedHave.get(item.area)!.push(item);
  }

  return (
    <div className="space-y-4">
      {/* 需购买 */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h3 className="font-semibold">🛒 需购买（{toBuy.length}）</h3>
          {toBuy.length === 0 && (
            <span className="text-xs text-emerald-600">所有食材都齐了</span>
          )}
        </div>
        {toBuy.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center">
              <CheckCircle2 className="size-7 text-emerald-600 mx-auto mb-2" />
              <p className="text-sm">家里食材都齐了，不用出门！</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {Array.from(groupedToBuy.entries()).map(([area, items]) => (
              <Card key={area}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    {AREA_LABEL[area] ?? area}（{items.length}）
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1.5">
                    {items.map((item) => (
                      <li
                        key={item.id}
                        className={cn(
                          "flex items-center justify-between text-sm gap-2",
                          item.isOptional && "opacity-60"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span>{item.name}</span>
                          {item.isOptional && (
                            <Badge variant="outline" className="text-xs">
                              可选
                            </Badge>
                          )}
                        </div>
                        <span className="text-muted-foreground">
                          {item.quantity} {item.unit}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 冰箱已有 */}
      {haveItems.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold text-muted-foreground">
            ✓ 冰箱/常备已有（{haveItems.length}）
          </h3>
          <Card className="bg-muted/30">
            <CardContent className="py-3 space-y-2">
              {Array.from(groupedHave.entries()).map(([area, items]) => (
                <div key={area} className="text-sm">
                  <span className="text-xs text-muted-foreground mr-2">
                    {AREA_LABEL[area] ?? area}：
                  </span>
                  <span className="text-muted-foreground">
                    {items
                      .map((i) => `${i.name}${i.quantity ? ` ${i.quantity}${i.unit}` : ""}`)
                      .join("、")}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
