import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import {
  UtensilsCrossed,
  Users,
  BookOpen,
  Refrigerator,
  Sparkles,
  ArrowRight,
  Star,
  History,
} from "lucide-react";

const MEAL_LABEL: Record<string, string> = {
  BREAKFAST: "早餐",
  LUNCH: "午餐",
  DINNER: "晚餐",
  SNACK: "加餐",
};

const MEAL_EMOJI: Record<string, string> = {
  BREAKFAST: "🌅",
  LUNCH: "🍱",
  DINNER: "🌙",
  SNACK: "🍡",
};

export default async function DashboardPage() {
  const session = await auth();
  const familyId = session!.user.familyId;
  const [family, recentSessions] = await Promise.all([
    familyId
      ? prisma.family.findUnique({
          where: { id: familyId },
          include: {
            _count: {
              select: { members: true, familyDishes: true, inventory: true, wishes: true },
            },
          },
        })
      : Promise.resolve(null),
    familyId
      ? prisma.mealSession.findMany({
          where: { familyId, status: "DONE" },
          orderBy: { targetTime: "desc" },
          take: 3,
          include: {
            menus: {
              where: { status: "CONFIRMED" },
              take: 1,
              include: {
                dishes: {
                  orderBy: { position: "asc" },
                  include: { dish: { select: { id: true, name: true } } },
                },
              },
            },
            feedbacks: { select: { rating: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8 space-y-7">
      <div className="space-y-1.5">
        <h1 className="text-3xl font-bold tracking-tight">
          {family ? `${family.name} · 今天吃什么？` : "欢迎来到厨神"}
        </h1>
        <p className="text-muted-foreground">
          点一桌好菜，剩下的交给厨神：推荐菜单、备齐采购、排好做饭节奏。
        </p>
      </div>

      {/* Hero CTA */}
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/12 via-accent/40 to-background shadow-md shadow-primary/5">
        <CardContent className="flex flex-col gap-5 p-7 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-primary p-3 text-primary-foreground shadow-sm shadow-primary/30">
              <Sparkles className="size-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-semibold tracking-tight">开始一顿饭</h2>
              <p className="text-sm text-muted-foreground max-w-md">
                告诉厨神今天几个人吃、想吃什么口味，立刻得到一套完整菜单与做饭时间线。
              </p>
            </div>
          </div>
          <Button asChild size="lg" className="shrink-0 shadow-sm shadow-primary/30">
            <Link href="/cook/new">
              <UtensilsCrossed className="size-4" />
              开始做饭
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard href="/family" icon={Users} label="家庭成员" value={family?._count.members ?? 0} unit="人" tone="orange" />
        <StatCard href="/dishes" icon={BookOpen} label="菜品库" value={family?._count.familyDishes ?? 0} unit="道" tone="green" />
        <StatCard href="/inventory" icon={Refrigerator} label="当前食材" value={family?._count.inventory ?? 0} unit="种" tone="blue" />
        <StatCard href="/dishes/wishes" icon={Sparkles} label="灵感库" value={family?._count.wishes ?? 0} unit="条" tone="purple" />
      </div>

      {recentSessions.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
              <History className="size-4 text-muted-foreground" />
              最近做了什么
            </h2>
            <Link
              href="/cook"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              全部记录 →
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {recentSessions.map((s) => {
              const dishes = s.menus[0]?.dishes ?? [];
              const ratings = s.feedbacks.map((f) => f.rating).filter((r): r is number => r !== null);
              const avg =
                ratings.length > 0
                  ? ratings.reduce((a, b) => a + b, 0) / ratings.length
                  : null;
              return (
                <Link key={s.id} href={`/cook/${s.id}`} className="group">
                  <Card className="h-full transition-all group-hover:-translate-y-0.5 group-hover:shadow-md">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-muted-foreground">
                          <span className="mr-1">{MEAL_EMOJI[s.mealType]}</span>
                          {formatDate(s.targetTime)} · {MEAL_LABEL[s.mealType]}
                        </div>
                        {avg !== null && (
                          <span className="inline-flex items-center gap-0.5 text-xs text-amber-600">
                            <Star className="size-3 fill-amber-400 text-amber-400" />
                            {avg.toFixed(1)}
                          </span>
                        )}
                      </div>
                      {dishes.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {dishes.slice(0, 4).map((d) => (
                            <Badge key={d.id} variant="soft" className="text-xs">
                              {d.dish.name}
                            </Badge>
                          ))}
                          {dishes.length > 4 && (
                            <Badge variant="outline" className="text-xs">
                              +{dishes.length - 4}
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground italic">无菜品记录</div>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

const TONES: Record<string, string> = {
  orange: "bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300",
  green: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
  blue: "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300",
  purple: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",
};

function StatCard({
  href,
  icon: Icon,
  label,
  value,
  unit,
  tone,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  unit: string;
  tone: keyof typeof TONES;
}) {
  return (
    <Link href={href} className="group">
      <Card className="h-full transition-all group-hover:-translate-y-0.5 group-hover:shadow-md">
        <CardContent className="p-5">
          <div className={cn("inline-flex size-10 items-center justify-center rounded-xl", TONES[tone])}>
            <Icon className="size-5" />
          </div>
          <div className="mt-3 flex items-baseline gap-1">
            <span className="text-3xl font-bold tracking-tight">{value}</span>
            <span className="text-xs text-muted-foreground">{unit}</span>
          </div>
          <div className="text-sm text-muted-foreground mt-0.5">{label}</div>
        </CardContent>
      </Card>
    </Link>
  );
}
