import Link from "next/link";
import { Plus, UtensilsCrossed, CheckCircle2, Clock, XCircle, ChefHat } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireFamilyId } from "@/lib/auth-helper";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatLocal, formatDate } from "@/lib/format";

const STATUS_BADGE = {
  DRAFTING: { label: "起草中", icon: Clock, variant: "secondary" as const },
  PLANNING: { label: "规划中", icon: Clock, variant: "secondary" as const },
  CONFIRMED: { label: "菜单已定", icon: CheckCircle2, variant: "default" as const },
  COOKING: { label: "做饭中", icon: UtensilsCrossed, variant: "default" as const },
  DONE: { label: "已完成", icon: CheckCircle2, variant: "success" as const },
  CANCELLED: { label: "已取消", icon: XCircle, variant: "outline" as const },
};

const MEAL_TYPE_LABEL = {
  BREAKFAST: "早餐",
  LUNCH: "午餐",
  DINNER: "晚餐",
  SNACK: "加餐",
};

export default async function CookPage() {
  const familyId = await requireFamilyId();
  const sessions = await prisma.mealSession.findMany({
    where: { familyId },
    include: {
      chef: { select: { id: true, name: true, email: true } },
      menus: {
        where: { status: { in: ["CONFIRMED", "DRAFT"] } },
        include: { dishes: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      _count: { select: { requests: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const active = sessions.filter((s) => !["DONE", "CANCELLED"].includes(s.status));
  const recent = sessions.filter((s) => ["DONE", "CANCELLED"].includes(s.status));

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">做饭</h1>
          <p className="text-sm text-muted-foreground">从今天吃什么开始</p>
        </div>
        <Button asChild>
          <Link href="/cook/new">
            <Plus className="size-4" />
            开始新一顿
          </Link>
        </Button>
      </div>

      {active.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">进行中</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {active.map((s) => {
              const status = STATUS_BADGE[s.status];
              const Icon = status.icon;
              const menu = s.menus[0];
              return (
                <Link href={`/cook/${s.id}`} key={s.id}>
                  <Card className="hover:shadow-md transition-shadow h-full">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">
                          {MEAL_TYPE_LABEL[s.mealType]} ·{" "}
                          {s.eaterAdults + s.eaterKids} 人
                        </div>
                        <Badge variant={status.variant}>
                          <Icon className="size-3" />
                          {status.label}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                        <span>
                          {formatLocal(s.targetTime)} 开饭
                        </span>
                        {s.chef && (
                          <span className="inline-flex items-center gap-0.5">
                            <ChefHat className="size-3" />
                            {s.chef.name ?? s.chef.email}
                          </span>
                        )}
                      </div>
                      {menu && (
                        <div className="text-sm">
                          {menu.dishes.map((d) => d.dishNameSnapshot).join("、")}
                        </div>
                      )}
                      {s._count.requests > 0 && (
                        <div className="text-xs text-muted-foreground">
                          已收到 {s._count.requests} 个点菜
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {sessions.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center space-y-4">
            <UtensilsCrossed className="size-12 text-muted-foreground mx-auto" />
            <div>
              <h3 className="font-medium">还没有做饭记录</h3>
              <p className="text-sm text-muted-foreground">
                点击「开始新一顿」让厨神帮你规划一顿饭
              </p>
            </div>
            <Button asChild>
              <Link href="/cook/new">
                <Plus className="size-4" />
                开始第一顿
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {recent.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">历史记录</h2>
          <div className="space-y-1.5">
            {recent.map((s) => {
              const status = STATUS_BADGE[s.status];
              const menu = s.menus[0];
              return (
                <Link
                  href={`/cook/${s.id}`}
                  key={s.id}
                  className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-accent text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs">
                        {formatDate(s.targetTime)}
                      </span>
                      <span>{MEAL_TYPE_LABEL[s.mealType]}</span>
                      {menu && (
                        <span className="truncate text-muted-foreground">
                          · {menu.dishes.map((d) => d.dishNameSnapshot).join("、")}
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
