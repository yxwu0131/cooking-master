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

  // 把全库菜品做成 name→meta 映射，供时间线按模块分组用
  const dishMetaByName = React.useMemo(() => {
    const m = new Map<string, DishMeta>();
    for (const d of allDishes) m.set(d.name, d);
    return m;
  }, [allDishes]);

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
        <ConfirmedMenuView
          session={session}
          menu={confirmedMenu}
          isChef={isChef}
          dishMetaByName={dishMetaByName}
        />
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
  dishMetaByName,
}: {
  session: Session;
  menu: NonNullable<Session["menus"][number]>;
  isChef: boolean;
  dishMetaByName: Map<string, DishMeta>;
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
          <TimelineView plan={menu.cookingPlan} dishMetaByName={dishMetaByName} />
        </TabsContent>
        <TabsContent value="shopping" className="mt-4">
          <ShoppingListView list={menu.shoppingList} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// 6 模块分类（基于用户给定结构）
type CookModule = 1 | 2 | 3 | 4 | 5 | 6;
const MODULE_INFO: Record<CookModule, { title: string; tip: string }> = {
  1: { title: "模块一 · 启动等待型", tip: "先把要等时间的事开起来：淘米煮饭、泡发、腌制、烧水" },
  2: { title: "模块二 · 集中备菜", tip: "把所有菜一次性切配上浆好，避免边切边炒" },
  3: { title: "模块三 · 提前完成冷菜", tip: "先做不怕凉的菜，先稳一道" },
  4: { title: "模块四 · 启动蒸煮", tip: "蒸鱼 / 煮汤 / 炖菜走起，不占炒锅" },
  5: { title: "模块五 · 连续快炒", tip: "炒菜冲刺，出锅即上桌；叶菜压轴" },
  6: { title: "模块六 · 收尾上桌", tip: "盛饭端汤摆碗筷" },
};

function classifyStepToModule(
  step: NonNullable<Session["menus"][number]["cookingPlan"]>["steps"][number],
  dish: DishMeta | undefined
): CookModule {
  const action = step.action;
  const cw = step.cookware ?? "";
  const t = step.stepType;
  const isCold =
    !!dish &&
    (dish.name.includes("凉拌") || dish.name.includes("冷盘") || dish.name.includes("沙拉"));
  // 1. 启动等待型：淘米煮饭、泡发、腌制、烧水
  if (t === "SOAK" || t === "MARINATE") return 1;
  if (cw.includes("电饭锅")) return 1;
  if (dish?.isStaple) return 1;
  if (/烧.*水|烧开水|备水/.test(action)) return 1;
  // 3. 冷菜（凉菜）：focal 步骤算 3
  if (isCold && (t === "BLANCH" || t === "PLATE" || t === "STIR_FRY" || t === "PREP")) return 3;
  // 2. 集中备菜
  if (t === "PREP" || t === "BLANCH") return 2;
  // 4. 蒸煮
  if (t === "STEAM" || t === "BRAISE") return 4;
  if (t === "BOIL") {
    if (dish?.isSoup) return 4;
    if (step.durationMinutes >= 8) return 4;
  }
  // 6. 收尾
  if (t === "PLATE" || /出锅|装盘|上桌|盛饭|端汤/.test(action)) return 6;
  // 5. 快炒（默认）
  return 5;
}

function TimelineView({
  plan,
  dishMetaByName,
}: {
  plan: Session["menus"][number]["cookingPlan"];
  dishMetaByName: Map<string, DishMeta>;
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

  // 按 6 模块归类，每个模块内按 startMinute 升序
  const buckets = new Map<CookModule, typeof plan.steps>();
  for (const s of plan.steps) {
    const dish = s.dishName ? dishMetaByName.get(s.dishName) : undefined;
    const mod = classifyStepToModule(s, dish);
    if (!buckets.has(mod)) buckets.set(mod, []);
    buckets.get(mod)!.push(s);
  }
  // 「收尾上桌」模块如果空，server 没有生成 PLATE 步骤，UI 给个占位提示
  if (!buckets.has(6)) buckets.set(6, []);
  const orderedModules: CookModule[] = [1, 2, 3, 4, 5, 6];

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

      {orderedModules.map((mod) => {
        const steps = (buckets.get(mod) ?? []).slice().sort((a, b) => a.startMinute - b.startMinute);
        if (steps.length === 0 && mod !== 6) return null;
        const info = MODULE_INFO[mod];
        const minStart = steps.length ? steps[0].startMinute : null;
        const maxEnd = steps.length
          ? Math.max(...steps.map((s) => s.startMinute + s.durationMinutes))
          : null;
        return (
          <Card key={mod}>
            <CardHeader className="pb-2">
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <CardTitle className="text-sm">{info.title}</CardTitle>
                {minStart !== null && (
                  <span className="text-xs text-muted-foreground font-mono">
                    +{minStart}~+{maxEnd}min
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{info.tip}</p>
            </CardHeader>
            <CardContent>
              {steps.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  开饭前盛饭端汤、摆碗筷、热菜上桌
                </p>
              ) : (
                <ol className="relative border-l border-border ml-3 space-y-3">
                  {steps.map((s) => (
                    <li key={s.order} className="ml-6 relative">
                      <span className="absolute -left-9 top-0 size-6 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center">
                        {s.startMinute}
                      </span>
                      <div className="space-y-1">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-xs text-muted-foreground font-mono">
                            +{s.startMinute}分钟
                          </span>
                          <span className="font-medium">{s.dishName}</span>
                          {s.isParallel && (
                            <Badge variant="outline" className="text-xs">
                              并行
                            </Badge>
                          )}
                        </div>
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
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        );
      })}
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
