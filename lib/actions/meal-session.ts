"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireFamilyId, requireUser } from "@/lib/auth-helper";

const createSessionSchema = z.object({
  mealType: z.enum(["BREAKFAST", "LUNCH", "DINNER", "SNACK"]).default("DINNER"),
  targetTime: z.coerce.date(),
  maxMinutes: z.coerce.number().int().min(10).max(240).default(60),
  eaterAdults: z.coerce.number().int().min(0).max(20).default(2),
  eaterKids: z.coerce.number().int().min(0).max(20).default(0),
  hasGuest: z.boolean().default(false),
  needLeftover: z.boolean().default(false),
  needLunchBox: z.boolean().default(false),
  attendingMemberIds: z.array(z.string()).default([]),
  contextFlags: z.record(z.string(), z.boolean()).default({}),
  notes: z.string().optional().nullable(),
  chefId: z.string().min(1).optional(),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;

export async function createMealSessionAction(input: CreateSessionInput) {
  const familyId = await requireFamilyId();
  const user = await requireUser();
  const parsed = createSessionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "参数错误" };
  }

  const { chefId: rawChefId, ...rest } = parsed.data;
  let chefId = rawChefId ?? user.id;

  // 校验 chefId 必须是该家庭已注册账户
  if (chefId !== user.id) {
    const chefUser = await prisma.user.findFirst({
      where: { id: chefId, familyId },
      select: { id: true },
    });
    if (!chefUser) {
      return { ok: false as const, error: "所选厨师不在本家庭" };
    }
  }

  const session = await prisma.mealSession.create({
    data: {
      familyId,
      chefId,
      ...rest,
      status: "DRAFTING",
    },
  });
  revalidatePath("/cook");
  redirect(`/cook/${session.id}`);
}

const requestSchema = z.object({
  sessionId: z.string().min(1),
  type: z.enum(["SPECIFIC_DISH", "FUZZY"]),
  content: z.string().min(1).max(200),
  memberId: z.string().optional().nullable(),
});

export async function addMealRequestAction(input: z.infer<typeof requestSchema>) {
  const familyId = await requireFamilyId();
  const user = await requireUser();
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "参数错误" };
  }
  const session = await prisma.mealSession.findFirst({
    where: { id: parsed.data.sessionId, familyId },
  });
  if (!session) return { ok: false as const, error: "Session 不存在" };

  await prisma.mealRequest.create({
    data: {
      sessionId: parsed.data.sessionId,
      type: parsed.data.type,
      content: parsed.data.content,
      authorUserId: user.id,
      memberId: parsed.data.memberId,
    },
  });
  revalidatePath(`/cook/${parsed.data.sessionId}`);
  return { ok: true as const };
}

export async function removeMealRequestAction(requestId: string) {
  const familyId = await requireFamilyId();
  const req = await prisma.mealRequest.findUnique({
    where: { id: requestId },
    include: { session: true },
  });
  if (!req || req.session.familyId !== familyId) {
    return { ok: false as const, error: "请求不存在" };
  }
  await prisma.mealRequest.delete({ where: { id: requestId } });
  revalidatePath(`/cook/${req.sessionId}`);
  return { ok: true as const };
}

export async function cancelSessionAction(sessionId: string) {
  const familyId = await requireFamilyId();
  const user = await requireUser();
  const session = await prisma.mealSession.findFirst({
    where: { id: sessionId, familyId },
    select: { chefId: true },
  });
  if (!session) {
    return { ok: false as const, error: "Session 不存在" };
  }
  if (session.chefId !== user.id) {
    return { ok: false as const, error: "只有当日厨师可以取消" };
  }
  await prisma.mealSession.update({
    where: { id: sessionId },
    data: { status: "CANCELLED" },
  });
  revalidatePath("/cook");
  redirect("/cook");
}
