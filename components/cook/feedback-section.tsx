"use client";

import * as React from "react";
import { toast } from "sonner";
import { Star, MessageSquare, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { createFeedbackAction } from "@/lib/actions/feedback";
import { cn } from "@/lib/utils";

const TAG_OPTIONS = [
  "好吃",
  "一般",
  "不喜欢",
  "孩子喜欢",
  "孩子不喜欢",
  "太咸",
  "太淡",
  "太油",
  "太辣",
  "太麻烦",
  "下次还做",
  "以后别推荐",
  "适合工作日",
  "适合周末",
  "适合带饭",
];

type Dish = { id: string; dishId: string; dishNameSnapshot: string };

export function FeedbackSection({
  sessionId,
  menuId,
  dishes,
}: {
  sessionId: string;
  menuId: string;
  dishes: Dish[];
}) {
  const [dishId, setDishId] = React.useState<string>("__menu__");
  const [rating, setRating] = React.useState<number | null>(null);
  const [tags, setTags] = React.useState<string[]>([]);
  const [comment, setComment] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  function toggleTag(t: string) {
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  function submit() {
    startTransition(async () => {
      const target = dishes.find((d) => d.id === dishId);
      const result = await createFeedbackAction({
        sessionId,
        menuId,
        dishId: target?.dishId ?? null,
        rating,
        tags,
        comment: comment.trim() || null,
      });
      if (result.ok) {
        toast.success("反馈已记录，下次推荐会更准");
        setRating(null);
        setTags([]);
        setComment("");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="size-4" />
          吃后反馈
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="text-sm font-medium">给哪道菜评价</div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setDishId("__menu__")}
              className={cn(
                "px-3 py-1 rounded-md text-xs border",
                dishId === "__menu__"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "hover:bg-accent"
              )}
            >
              整体菜单
            </button>
            {dishes.map((d) => (
              <button
                key={d.id}
                onClick={() => setDishId(d.id)}
                className={cn(
                  "px-3 py-1 rounded-md text-xs border",
                  dishId === d.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "hover:bg-accent"
                )}
              >
                {d.dishNameSnapshot}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">星级评分</div>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(rating === n ? null : n)}
                className="p-1 hover:scale-110 transition-transform"
              >
                <Star
                  className={cn(
                    "size-6",
                    rating !== null && n <= rating
                      ? "fill-amber-400 text-amber-400"
                      : "text-muted-foreground"
                  )}
                />
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">标签（多选）</div>
          <div className="flex flex-wrap gap-1.5">
            {TAG_OPTIONS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggleTag(t)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs border",
                  tags.includes(t)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "hover:bg-accent"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="text-sm font-medium">备注（可选）</div>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="想到什么写什么"
            rows={2}
          />
        </div>

        <Button
          onClick={submit}
          disabled={pending || (!rating && tags.length === 0 && !comment.trim())}
        >
          <ThumbsUp className="size-4" />
          提交反馈
        </Button>
      </CardContent>
    </Card>
  );
}
