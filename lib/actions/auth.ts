"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import { consumeInviteCodeInTx } from "@/lib/invite-helper";

const baseRegisterSchema = z.object({
  email: z.string().email("邮箱格式不正确"),
  password: z.string().min(10, "密码至少 10 位"),
  name: z.string().min(1, "请填写姓名"),
});

// 两种注册路径：建新家庭 / 用邀请码加入已有家庭
const registerSchema = z.discriminatedUnion("mode", [
  baseRegisterSchema.extend({
    mode: z.literal("new"),
    familyName: z.string().min(1, "请填写家庭名称"),
  }),
  baseRegisterSchema.extend({
    mode: z.literal("invite"),
    inviteCode: z.string().min(4, "请输入邀请码"),
  }),
]);

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function registerAction(formData: FormData): Promise<ActionResult> {
  const inviteCode = (formData.get("inviteCode") as string | null)?.trim();
  const raw = inviteCode
    ? {
        mode: "invite" as const,
        email: formData.get("email"),
        password: formData.get("password"),
        name: formData.get("name"),
        inviteCode,
      }
    : {
        mode: "new" as const,
        email: formData.get("email"),
        password: formData.get("password"),
        name: formData.get("name"),
        familyName: formData.get("familyName"),
      };
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "请检查表单输入",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  // 自助创建新家庭默认关闭（公网部署防陌生人注册成 ADMIN）；加家人请用邀请码。
  // 需要开放自助建家庭（如本地初始化/首个家庭引导）时设 ALLOW_OPEN_REGISTRATION=1。
  if (parsed.data.mode === "new" && process.env.ALLOW_OPEN_REGISTRATION !== "1") {
    return { ok: false, error: "自助创建家庭已关闭，请使用家人的邀请码加入" };
  }

  const { email, password, name } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return { ok: false, error: "该邮箱已注册" };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    await prisma.$transaction(async (tx) => {
      if (parsed.data.mode === "new") {
        const family = await tx.family.create({
          data: {
            name: parsed.data.familyName,
            preference: { create: {} },
            kitchen: { create: {} },
          },
        });
        await tx.user.create({
          data: {
            email: normalizedEmail,
            name,
            passwordHash,
            role: "ADMIN",
            familyId: family.id,
            familyMember: {
              create: {
                familyId: family.id,
                name,
                ageGroup: "ADULT",
              },
            },
          },
        });
      } else {
        // 邀请码加入：先创建用户拿到 userId，再消费邀请码（事务内任一步骤失败都回滚）
        const newUser = await tx.user.create({
          data: {
            email: normalizedEmail,
            name,
            passwordHash,
            role: "MEMBER",
          },
        });
        const invite = await consumeInviteCodeInTx(tx, parsed.data.inviteCode, newUser.id);
        await tx.user.update({
          where: { id: newUser.id },
          data: {
            familyId: invite.familyId,
            familyMember: {
              create: {
                familyId: invite.familyId,
                name,
                ageGroup: "ADULT",
              },
            },
          },
        });
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "注册失败";
    // 来自 consumeInviteCodeInTx 的中文错误透传
    if (msg.includes("邀请码")) {
      return { ok: false, error: msg };
    }
    console.error("[register] tx failed", e);
    return { ok: false, error: "注册失败，请稍后再试" };
  }

  // 注册成功后自动登录
  try {
    await signIn("credentials", {
      email: normalizedEmail,
      password,
      redirect: false,
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return { ok: false, error: "注册成功，请手动登录" };
    }
    throw e;
  }

  return { ok: true };
}

export async function loginAction(formData: FormData): Promise<ActionResult> {
  const raw = {
    email: formData.get("email"),
    password: formData.get("password"),
  };
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "请填写完整登录信息" };
  }
  try {
    await signIn("credentials", {
      email: parsed.data.email.toLowerCase(),
      password: parsed.data.password,
      redirect: false,
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof AuthError) {
      const msg = e.type === "CredentialsSignin" ? "邮箱或密码错误" : "登录失败";
      return { ok: false, error: msg };
    }
    throw e;
  }
}
