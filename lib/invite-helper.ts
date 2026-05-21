import type { Prisma } from "@prisma/client";

/**
 * 在用户注册事务里消费邀请码。
 * 仅在 prisma.$transaction 内部调用，参数 tx 非可序列化，不能放进 "use server"。
 */
export async function consumeInviteCodeInTx(
  tx: Prisma.TransactionClient,
  code: string,
  userId: string
) {
  const invite = await tx.inviteCode.findUnique({
    where: { code: code.toUpperCase() },
  });
  if (!invite) throw new Error("邀请码不存在");
  if (invite.usedAt) throw new Error("邀请码已被使用");
  if (invite.expiresAt.getTime() < Date.now()) throw new Error("邀请码已过期");
  await tx.inviteCode.update({
    where: { id: invite.id },
    data: { usedAt: new Date(), usedBy: userId },
  });
  return invite;
}
