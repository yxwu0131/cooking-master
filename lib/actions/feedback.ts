"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireFamilyId, requireUser } from "@/lib/auth-helper";

const feedbackSchema = z.object({
  sessionId: z.string().min(1),
  menuId: z.string().optional().nullable(),
  dishId: z.string().optional().nullable(),
  memberId: z.string().optional().nullable(),
  rating: z.coerce.number().int().min(1).max(5).optional().nullable(),
  tags: z.array(z.string()).default([]),
  comment: z.string().optional().nullable(),
});

export type FeedbackInput = z.infer<typeof feedbackSchema>;

export async function createFeedbackAction(input: FeedbackInput) {
  const familyId = await requireFamilyId();
  const user = await requireUser();
  const parsed = feedbackSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "参数错误" };
  }

  const session = await prisma.mealSession.findFirst({
    where: { id: parsed.data.sessionId, familyId },
  });
  if (!session) return { ok: false as const, error: "Session 不存在" };

  await prisma.feedback.create({
    data: {
      sessionId: parsed.data.sessionId,
      menuId: parsed.data.menuId,
      dishId: parsed.data.dishId,
      authorUserId: user.id,
      memberId: parsed.data.memberId,
      rating: parsed.data.rating,
      tags: parsed.data.tags,
      comment: parsed.data.comment,
    },
  });

  // 反馈影响 FamilyDish 评分（简单聚合：取该菜历史反馈 rating 平均）
  if (parsed.data.dishId) {
    const aggregate = await prisma.feedback.aggregate({
      where: { dishId: parsed.data.dishId, session: { familyId } },
      _avg: { rating: true },
    });
    const newRating = aggregate._avg.rating;

    // 根据标签自动调整 status
    let statusUpdate: { status: "BLOCKED" | "LOVED" | "KID_FAVORITE" } | undefined;
    if (parsed.data.tags.includes("以后别推荐")) {
      statusUpdate = { status: "BLOCKED" };
    } else if (parsed.data.tags.includes("孩子喜欢")) {
      statusUpdate = { status: "KID_FAVORITE" };
    } else if (parsed.data.tags.includes("下次还做") || (newRating && newRating >= 4)) {
      statusUpdate = { status: "LOVED" };
    }

    await prisma.familyDish.upsert({
      where: {
        familyId_dishId: { familyId, dishId: parsed.data.dishId },
      },
      create: {
        familyId,
        dishId: parsed.data.dishId,
        rating: newRating,
        status: statusUpdate?.status ?? "WANT_TO_TRY",
      },
      update: {
        rating: newRating,
        ...(statusUpdate ?? {}),
      },
    });
  }

  revalidatePath(`/cook/${parsed.data.sessionId}`);
  revalidatePath("/feedback");
  return { ok: true as const };
}
