import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

/**
 * 服务端组件 / Server Action 中获取当前登录用户。
 * 未登录则重定向到 /login。
 */
export async function requireUser() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  return session.user;
}

/**
 * 获取当前用户的 familyId，确保业务查询不串户。
 * 未登录或没有 family 则抛错。
 */
export async function requireFamilyId(): Promise<string> {
  const user = await requireUser();
  if (!user.familyId) {
    throw new Error("当前用户尚未关联家庭");
  }
  return user.familyId;
}

/**
 * 获取当前家庭完整信息（含偏好、厨房）
 */
export async function getCurrentFamily() {
  const familyId = await requireFamilyId();
  const family = await prisma.family.findUnique({
    where: { id: familyId },
    include: {
      preference: true,
      kitchen: true,
      members: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!family) {
    throw new Error("家庭不存在");
  }
  return family;
}
