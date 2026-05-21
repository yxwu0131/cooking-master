import Link from "next/link";
import { Star, MessageSquare } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireFamilyId } from "@/lib/auth-helper";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";

export default async function FeedbackHistoryPage() {
  const familyId = await requireFamilyId();
  const feedbacks = await prisma.feedback.findMany({
    where: { session: { familyId } },
    include: {
      dish: { select: { id: true, name: true } },
      authorUser: { select: { name: true } },
      member: { select: { name: true } },
      session: { select: { id: true, mealType: true, targetTime: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">反馈历史</h1>
        <p className="text-sm text-muted-foreground">
          所有家庭成员对菜品的评价，越多反馈推荐越精准。
        </p>
      </div>

      {feedbacks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="size-12 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              还没有反馈记录。做完饭后到「做饭」页面填反馈。
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {feedbacks.map((f) => (
            <Card key={f.id}>
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
