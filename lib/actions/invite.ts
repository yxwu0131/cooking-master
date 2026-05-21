"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser, requireFamilyId } from "@/lib/auth-helper";

const CODE_LENGTH = 8;
const DEFAULT_EXPIRES_DAYS = 7;
// 去掉容易混淆的字符 0/O/1/I/L
const CODE_CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_CHARSET[bytes[i] % CODE_CHARSET.length];
  }
  return out;
}

export type InviteCodeSummary = {
  id: string;
  code: string;
  expiresAt: Date;
  usedAt: Date | null;
  usedBy: string | null;
  usedByName: string | null;
  createdAt: Date;
  status: "active" | "used" | "expired";
};

function inviteStatus(
  iv: { expiresAt: Date; usedAt: Date | null }
): "active" | "used" | "expired" {
  if (iv.usedAt) return "used";
  if (iv.expiresAt.getTime() < Date.now()) return "expired";
  return "active";
}

export async function createInviteCodeAction(input?: { expiresInDays?: number }) {
  const user = await requireUser();
  const familyId = await requireFamilyId();
  if (user.role !== "ADMIN") {
    return { ok: false as const, error: "仅管理员可创建邀请码" };
  }
  const days = Math.min(Math.max(input?.expiresInDays ?? DEFAULT_EXPIRES_DAYS, 1), 30);

  // 尝试 5 次避免极小概率冲突
  let lastErr: unknown = null;
  for (let i = 0; i < 5; i++) {
    const code = generateCode();
    try {
      const invite = await prisma.inviteCode.create({
        data: {
          code,
          familyId,
          createdBy: user.id!,
          expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
        },
      });
      revalidatePath("/family");
      return { ok: true as const, code: invite.code, expiresAt: invite.expiresAt };
    } catch (e) {
      lastErr = e;
    }
  }
  console.error("[invite] create failed after retries", lastErr);
  return { ok: false as const, error: "邀请码生成失败，请稍后再试" };
}

export async function listInviteCodesAction(): Promise<InviteCodeSummary[]> {
  const familyId = await requireFamilyId();
  const rows = await prisma.inviteCode.findMany({
    where: { familyId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  // 收集所有 usedBy userId 一次查名字
  const userIds = rows.map((r) => r.usedBy).filter((x): x is string => !!x);
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const nameMap = new Map(users.map((u) => [u.id, u.name ?? u.email]));

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    expiresAt: r.expiresAt,
    usedAt: r.usedAt,
    usedBy: r.usedBy,
    usedByName: r.usedBy ? nameMap.get(r.usedBy) ?? null : null,
    createdAt: r.createdAt,
    status: inviteStatus(r),
  }));
}

export async function revokeInviteCodeAction(inviteId: string) {
  const user = await requireUser();
  const familyId = await requireFamilyId();
  if (user.role !== "ADMIN") {
    return { ok: false as const, error: "仅管理员可撤销邀请码" };
  }
  const existing = await prisma.inviteCode.findFirst({
    where: { id: inviteId, familyId },
  });
  if (!existing) return { ok: false as const, error: "邀请码不存在" };
  if (existing.usedAt) return { ok: false as const, error: "该邀请码已被使用，无法撤销" };
  // 直接删除（未使用的邀请码无外键依赖）
  await prisma.inviteCode.delete({ where: { id: inviteId } });
  revalidatePath("/family");
  return { ok: true as const };
}

/**
 * 公开校验邀请码 —— 注册页加载时用，不要求登录。
 * 返回家庭名（用于显示「加入 XX 家庭」）。
 */
export async function validateInviteCodePublic(code: string) {
  if (!code || code.length < 4) {
    return { ok: false as const, error: "邀请码格式错误" };
  }
  const invite = await prisma.inviteCode.findUnique({
    where: { code: code.toUpperCase() },
    include: { family: { select: { name: true } } },
  });
  if (!invite) return { ok: false as const, error: "邀请码不存在" };
  if (invite.usedAt) return { ok: false as const, error: "邀请码已被使用" };
  if (invite.expiresAt.getTime() < Date.now()) {
    return { ok: false as const, error: "邀请码已过期" };
  }
  return {
    ok: true as const,
    familyName: invite.family.name,
    expiresAt: invite.expiresAt,
  };
}

