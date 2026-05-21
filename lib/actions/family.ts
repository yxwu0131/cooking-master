"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireFamilyId } from "@/lib/auth-helper";

// ============================================================
// 家庭基本信息
// ============================================================
const familyUpdateSchema = z.object({
  name: z.string().min(1, "请填写家庭名称").max(50),
});

export async function updateFamilyAction(input: z.infer<typeof familyUpdateSchema>) {
  const familyId = await requireFamilyId();
  const parsed = familyUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "参数错误" };
  }
  await prisma.family.update({
    where: { id: familyId },
    data: { name: parsed.data.name },
  });
  revalidatePath("/family");
  return { ok: true as const };
}

// ============================================================
// 家庭成员
// ============================================================
const memberCreateSchema = z.object({
  name: z.string().min(1, "请填写成员姓名"),
  ageGroup: z.enum(["TODDLER", "CHILD", "TEEN", "ADULT", "ELDER"]),
  birthYear: z.coerce.number().int().min(1900).max(new Date().getFullYear()).optional().nullable(),
  isChild: z.boolean().default(false),
  isElder: z.boolean().default(false),
  dislikes: z.array(z.string()).default([]),
  favorites: z.array(z.string()).default([]),
  allergies: z.array(z.string()).default([]),
  spicyTolerance: z.coerce.number().min(0).max(5).default(2),
  saltPreference: z.enum(["light", "normal", "heavy"]).default("normal"),
  notes: z.string().optional().nullable(),
  // 该成员若会下厨：做饭熟练度 + 可接受的最高难度（不下厨可留空）
  cookingSkill: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).optional().nullable(),
  maxComplexity: z.coerce.number().int().min(1).max(5).optional().nullable(),
});

export type MemberInput = z.infer<typeof memberCreateSchema>;

export async function createMemberAction(input: MemberInput) {
  const familyId = await requireFamilyId();
  const parsed = memberCreateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "参数错误" };
  }
  const { spicyTolerance, saltPreference, cookingSkill, maxComplexity, ...rest } = parsed.data;
  await prisma.familyMember.create({
    data: {
      familyId,
      ...rest,
      tasteProfile: { spicyTolerance, saltPreference },
      cookingSkill: cookingSkill ?? null,
      maxComplexity: maxComplexity ?? null,
    },
  });
  revalidatePath("/family");
  return { ok: true as const };
}

export async function updateMemberAction(memberId: string, input: MemberInput) {
  const familyId = await requireFamilyId();
  const parsed = memberCreateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "参数错误" };
  }
  // 确认归属
  const existing = await prisma.familyMember.findFirst({
    where: { id: memberId, familyId },
  });
  if (!existing) {
    return { ok: false as const, error: "成员不存在" };
  }
  const { spicyTolerance, saltPreference, cookingSkill, maxComplexity, ...rest } = parsed.data;
  await prisma.familyMember.update({
    where: { id: memberId },
    data: {
      ...rest,
      tasteProfile: { spicyTolerance, saltPreference },
      cookingSkill: cookingSkill ?? null,
      maxComplexity: maxComplexity ?? null,
    },
  });
  revalidatePath("/family");
  return { ok: true as const };
}

export async function deleteMemberAction(memberId: string) {
  const familyId = await requireFamilyId();
  const existing = await prisma.familyMember.findFirst({
    where: { id: memberId, familyId },
  });
  if (!existing) {
    return { ok: false as const, error: "成员不存在" };
  }
  // 关联到 user 的不能删（删用户才能删成员档案）
  if (existing.userId) {
    return { ok: false as const, error: "已注册的成员不能直接删除，请先在账号管理中处理" };
  }
  await prisma.familyMember.delete({ where: { id: memberId } });
  revalidatePath("/family");
  return { ok: true as const };
}

// ============================================================
// 厨房条件
// ============================================================
const kitchenSchema = z.object({
  cookware: z.array(z.string()).default([]),
  stoveCount: z.coerce.number().int().min(1).max(8).default(2),
  hasDishwasher: z.boolean().default(false),
  hasRiceCooker: z.boolean().default(true),
  hasAirFryer: z.boolean().default(false),
  hasOven: z.boolean().default(false),
  hasSteamer: z.boolean().default(false),
  hasPressureCooker: z.boolean().default(false),
  commonSeasonings: z.array(z.string()).default([]),
  staples: z.array(z.string()).default([]),
});

export type KitchenInput = z.infer<typeof kitchenSchema>;

export async function updateKitchenAction(input: KitchenInput) {
  const familyId = await requireFamilyId();
  const parsed = kitchenSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "参数错误" };
  }
  await prisma.kitchenProfile.upsert({
    where: { familyId },
    create: { familyId, ...parsed.data },
    update: parsed.data,
  });
  revalidatePath("/family");
  return { ok: true as const };
}

// ============================================================
// 家庭偏好
// ============================================================
const preferenceSchema = z.object({
  cuisines: z.array(z.string()).default([]),
  light: z.boolean().default(false),
  hearty: z.boolean().default(false),
  lowOilSalt: z.boolean().default(false),
  noSpicy: z.boolean().default(false),
  mildSpicy: z.boolean().default(false),
  childFriendly: z.boolean().default(false),
  needLunchBox: z.boolean().default(false),
  healthGoals: z.array(z.string()).default([]),
});

export type PreferenceInput = z.infer<typeof preferenceSchema>;

export async function updatePreferenceAction(input: PreferenceInput) {
  const familyId = await requireFamilyId();
  const parsed = preferenceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "参数错误" };
  }
  const { cuisines, childFriendly, needLunchBox, healthGoals, ...flags } = parsed.data;
  await prisma.familyPreference.upsert({
    where: { familyId },
    create: {
      familyId,
      cuisines,
      tasteFlags: flags,
      childFriendly,
      needLunchBox,
      healthGoals,
    },
    update: {
      cuisines,
      tasteFlags: flags,
      childFriendly,
      needLunchBox,
      healthGoals,
    },
  });
  revalidatePath("/family");
  return { ok: true as const };
}
