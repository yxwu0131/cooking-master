import Link from "next/link";
import { Star, MessageSquare, Sparkles, Heart } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireFamilyId } from "@/lib/auth-helper";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";

export default async function FeedbackHistoryPage() {
  const familyId = await requireFamilyId();
  const [feedbacks, totalCount] = await Promise.all([
    prisma.feedback.findMany({
      where: { session: { familyId } },
      include: {
        dish: { select: { id: true, name: true } },
        authorUser: { select: { name: true } },
        member: { select: { name: true } },
        session: { select: { id: true, mealType: true, targetTime: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.feedback.count({ where: { session: { familyId } } }),
  ]);

  const rated = feedbacks.filter((f) => f.rating !== null);
  const avgRating =
    rated.length > 0
      ? rated.reduce((s, f) => s + (f.rating ?? 0), 0) / rated.length
      : 0;
  const fiveStarCount = feedbacks.filter((f) => f.rating === 5).length;
  const topDish = (() => {
    const tally = new Map<string, { name: string; score: number }>();
    for (const f of feedbacks) {
      if (!f.dish || f.rating === null) continue;
      const cur = tally.get(f.dish.id) ?? { name: f.dish.name, score: 0 };
      cur.score += f.rating;
      tally.set(f.dish.id, cur);
    }
    return [...tally.values()].sort((a, b) => b.score - a.score)[0]?.name ?? null;
  })();

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">反馈历史</h1>
        <p className="text-sm text-muted-foreground">
          所有家庭成员对菜品的评价，越多反馈推荐越精准。
        </p>
      </div>

      {totalCount > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatTile icon={MessageSquare} label="反馈" value={`${totalCount}`} tone="orange" />
          <StatTile
            icon={Star}
            label="平均分"
            value={rated.length > 0 ? avgRating.toFixed(1) : "—"}
            tone="amber"
          />
          <StatTile icon={Heart} label="5星好评" value={`${fiveStarCount}`} tone="rose" />
          <StatTile
            icon={Sparkles}
            label="最爱"
            value={topDish ?? "—"}
            tone="green"
            truncate
          />
        </div>
      )}

      {feedbacks.length === 0 ? (
        <Card className="border-primary/15 bg-gradient-to-br from-primary/8 via-accent/40 to-background">
          <CardContent className="py-12 text-center space-y-2">
            <div className="inline-flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mx-auto">
              <MessageSquare className="size-6" />
            </div>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              还没有反馈记录。做完饭后到「做饭」页面填反馈，下次推荐会更准。
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {feedbacks.map((f) => (
            <Card
              key={f.id}
              className={cn(
                "border-l-4",
                f.rating === 5
                  ? "border-l-amber-400"
                  : f.rating === 4
                    ? "border-l-amber-300"
                    : f.rating !== null && f.rating >= 3
                      ? "border-l-muted-foreground/30"
                      : f.rating !== null
                        ? "border-l-destructive/40"
                        : "border-l-transparent"
              )}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    {f.dish ? (
                      <Link
                        href={`/dishes/${f.dish.id}`}
                        className="font-medium hover:text-primary"
                      >
                        {f.dish.name}
                      </Link>
                    ) : (
                      <span className="font-medium text-muted-foreground">整体菜单</span>
                    )}
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {f.member?.name ?? f.authorUser?.name ?? "厨师"} ·{" "}
                      {formatDate(f.createdAt)}
                    </div>
                  </div>
                  {f.rating !== null && (
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star
                          key={n}
                          className={cn(
                            "size-3.5",
                            n <= f.rating!
                              ? "fill-amber-400 text-amber-400"
                              : "text-muted-foreground"
                          )}
                        />
                      ))}
                    </div>
                  )}
                </div>
                {f.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1.5">
                    {f.tags.map((t) => (
                      <Badge key={t} variant="secondary" className="text-xs">
                        {t}
                      </Badge>
                    ))}
                  </div>
                )}
                {f.comment && (
                  <p className="text-sm text-muted-foreground border-l-2 pl-3 mt-2">
                    {f.comment}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

const TILE_TONES: Record<string, string> = {
  orange: "bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300",
  amber: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
  rose: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
  green: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
};

function StatTile({
  icon: Icon,
  label,
  value,
  tone,
  truncate,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: keyof typeof TILE_TONES;
  truncate?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className={cn("inline-flex size-8 items-center justify-center rounded-lg", TILE_TONES[tone])}>
          <Icon className="size-4" />
        </div>
        <div
          className={cn(
            "mt-2 text-lg font-semibold leading-tight",
            truncate && "truncate"
          )}
          title={truncate ? value : undefined}
        >
          {value}
        </div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}
