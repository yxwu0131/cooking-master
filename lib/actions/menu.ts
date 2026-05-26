"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireFamilyId, requireUser } from "@/lib/auth-helper";
import { getAIProvider, type MenuRecommendInput } from "@/lib/ai/provider";
import { generateShoppingListForMenu } from "@/lib/planning/shopping-list";
import { generateCookingPlanForMenu } from "@/lib/planning/cooking-plan";
import { ensureRecipesForMenu } from "@/lib/planning/ensure-recipes";

/**
 * 调用 AI 为指定 Session 生成菜单方案（多套）。
 * 1. 收集所有上下文 → 喂给 AI
 * 2. AI 返回 2-3 套方案
 * 3. 对每套方案：把 AI 给出的菜名匹配到 Dish 表（缺失的菜后续可以再生成菜谱）
 * 4. 写入 Menu + MenuDish 记录
 */
export async function generateMenuPlansAction(sessionId: string) {
  const familyId = await requireFamilyId();
  const user = await requireUser();
  const session = await prisma.mealSession.findFirst({
    where: { id: sessionId, familyId },
    include: {
      requests: {
        include: { authorUser: true, member: true },
      },
    },
  });
  if (!session) return { ok: false as const, error: "Session 不存在" };
  if (session.chefId !== user.id) {
    return { ok: false as const, error: "只有当日厨师可以生成菜单" };
  }

  const [family, members, kitchen, inventory, familyDishes, dishes, recentSessions, chefUser] =
    await Promise.all([
      prisma.familyPreference.findUnique({ where: { familyId } }),
      prisma.familyMember.findMany({ where: { familyId } }),
      prisma.kitchenProfile.findUnique({ where: { familyId } }),
      prisma.inventory.findMany({
        where: { familyId },
        include: { ingredient: true },
      }),
      prisma.familyDish.findMany({
        where: { familyId },
        include: { dish: { select: { name: true } } },
      }),
      prisma.dish.findMany({
        select: {
          name: true,
          cuisine: true,
          isSpicy: true,
          isLight: true,
          isHearty: true,
          isSoup: true,
          isVegetarian: true,
          isChildFriendly: true,
          mainIngredients: true,
          totalMinutes: true,
          difficulty: true,
          isStaple: true,
          id: true,
        },
      }),
      prisma.mealSession.findMany({
        where: {
          familyId,
          status: { in: ["CONFIRMED", "COOKING", "DONE"] },
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        include: {
          menus: {
            where: { status: "CONFIRMED" },
            include: { dishes: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.user.findUnique({
        where: { id: session.chefId },
        select: { id: true, name: true, email: true },
      }),
    ]);

  // 厨师对应的 FamilyMember（取其下厨能力）
  const chefMember = members.find((m) => m.userId === session.chefId);
  const chefSkillLevel = chefMember?.cookingSkill ?? "INTERMEDIATE";
  const chefMaxComplexity = chefMember?.maxComplexity ?? 3;
  const chefName = chefMember?.name ?? chefUser?.name ?? chefUser?.email ?? "厨师";

  // 准备 AI 输入
  const aiInput: MenuRecommendInput = {
    family: {
      name: "我家",
      cuisines: family?.cuisines ?? ["家常菜"],
      tasteFlags: (family?.tasteFlags as MenuRecommendInput["family"]["tasteFlags"]) ?? {},
      childFriendly: family?.childFriendly ?? false,
      healthGoals: family?.healthGoals ?? [],
    },
    members: members
      .filter((m) => {
        // 如果指定了当餐就餐成员，只传这部分；否则全家
        if (session.attendingMemberIds.length === 0) return true;
        return session.attendingMemberIds.includes(m.id);
      })
      .map((m) => {
        const tp = (m.tasteProfile as { spicyTolerance?: number; saltPreference?: string } | null) ?? {};
        return {
          name: m.name,
          ageGroup: m.ageGroup,
          isChild: m.isChild,
          isElder: m.isElder,
          dislikes: m.dislikes,
          favorites: m.favorites,
          allergies: m.allergies,
          spicyTolerance: tp.spicyTolerance ?? 2,
          saltPreference: tp.saltPreference ?? "normal",
        };
      }),
    kitchen: {
      cookware: kitchen?.cookware ?? ["炒锅", "汤锅"],
      stoveCount: kitchen?.stoveCount ?? 2,
      hasRiceCooker: kitchen?.hasRiceCooker ?? true,
      hasSteamer: kitchen?.hasSteamer ?? false,
      hasPressureCooker: kitchen?.hasPressureCooker ?? false,
      hasAirFryer: kitchen?.hasAirFryer ?? false,
      hasOven: kitchen?.hasOven ?? false,
      commonSeasonings: kitchen?.commonSeasonings ?? [],
    },
    chef: {
      name: chefName,
      skillLevel: chefSkillLevel,
      maxComplexity: chefMaxComplexity,
    },
    inventory: inventory.map((i) => ({
      name: i.ingredient.name,
      quantity: i.quantity,
      unit: i.unit,
      expiringSoon:
        i.expiresAt !== null &&
        (i.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24) <= 3,
    })),
    session: {
      mealType: session.mealType,
      eaterAdults: session.eaterAdults,
      eaterKids: session.eaterKids,
      hasGuest: session.hasGuest,
      maxMinutes: session.maxMinutes,
      needLeftover: session.needLeftover,
      needLunchBox: session.needLunchBox,
      contextFlags: (session.contextFlags as Record<string, boolean>) ?? {},
    },
    requests: session.requests.map((r) => ({
      type: r.type,
      content: r.content,
      from: r.member?.name ?? r.authorUser?.name ?? undefined,
    })),
    preferredFamilyDishes: familyDishes
      .filter((fd) => !["DISLIKED", "BLOCKED"].includes(fd.status))
      .map((fd) => ({
        name: fd.dish.name,
        status: fd.status,
        cookCount: fd.cookCount,
        lastCookedAt: fd.lastCookedAt ? fd.lastCookedAt.toISOString() : null,
      })),
    blockedDishNames: familyDishes
      .filter((fd) => fd.status === "BLOCKED" || fd.status === "DISLIKED")
      .map((fd) => fd.dish.name),
    recentlyCookedNames: Array.from(
      new Set(
        recentSessions.flatMap((s) =>
          s.menus.flatMap((m) => m.dishes.map((d) => d.dishNameSnapshot))
        )
      )
    ),
    availableDishes: dishes.map((d) => ({
      name: d.name,
      cuisine: d.cuisine,
      isSpicy: d.isSpicy,
      isLight: d.isLight,
      isHearty: d.isHearty,
      isSoup: d.isSoup,
      isVegetarian: d.isVegetarian,
      isChildFriendly: d.isChildFriendly,
      mainIngredients: d.mainIngredients,
      totalMinutes: d.totalMinutes,
      difficulty: d.difficulty,
    })),
    desiredStructure: deriveDesiredStructure(session.eaterAdults, session.eaterKids, session.hasGuest),
  };

  // 调 AI
  let aiOutput;
  try {
    aiOutput = await getAIProvider().recommendMenu(aiInput);
  } catch (e) {
    console.error("[generateMenuPlans] AI 调用失败:", e);
    return { ok: false as const, error: mapAIErrorToChinese(e) };
  }

  // 清理该 session 旧的草稿菜单（避免反复生成堆积）
  await prisma.menu.deleteMany({
    where: { sessionId, status: "DRAFT" },
  });

  // 写入新菜单
  const dishNameToId = new Map(dishes.map((d) => [d.name, d.id]));
  // 已知主食菜（库里标了 isStaple 的，如「白米饭」「牛肉焖饭」「扬州炒饭」）
  const stapleNames = new Set(dishes.filter((d) => d.isStaple).map((d) => d.name));

  // 主食兜底：午餐/晚餐若 AI 漏了主食，自动补一份「白米饭」
  const needStaple = ["LUNCH", "DINNER"].includes(session.mealType);
  let stapleDishMeta: { id: string; name: string } | null = null;
  if (needStaple) {
    const staple = await prisma.dish.findFirst({
      where: { isStaple: true, name: "白米饭" },
      select: { id: true, name: true },
    });
    stapleDishMeta = staple;
  }
  for (const plan of aiOutput.plans) {
    if (!needStaple || !stapleDishMeta) continue;
    // 判主食：①库里标了 isStaple 的菜名；②菜名含主食特征词。
    // 注意「牛肉焖饭/炒饭/盖饭/煲仔饭」等本身就是主食，旧正则只认「米饭」会漏判→重复补饭。
    const hasStaple = plan.dishes.some(
      (d) =>
        stapleNames.has(d.name) ||
        /饭|面条|拌面|捞面|炒面|汤面|烩面|刀削面|焖面|米粉|河粉|米线|酸辣粉|螺蛳粉|馒头|饺子|包子|粥|馄饨|面包|烧麦|花卷|年糕|泡馍|手抓/.test(
          d.name
        )
    );
    if (!hasStaple) {
      plan.dishes.push({
        name: stapleDishMeta.name,
        reason: "兜底主食（AI 未推荐时自动补）",
        usedFromInventory:
          inventory.find((i) => i.ingredient.name === "大米")
            ? ["大米"]
            : [],
        missingIngredients: inventory.find((i) => i.ingredient.name === "大米")
          ? []
          : [{ name: "大米", quantity: 300, unit: "g" }],
      });
    }
  }

  for (const [idx, plan] of aiOutput.plans.entries()) {
    // 为不在库里的菜品占位创建 Dish 记录（来源 AI_GENERATED）
    const ensureDishIds: Array<{ name: string; id: string }> = [];
    for (const ai of plan.dishes) {
      let id = dishNameToId.get(ai.name);
      if (!id) {
        const created = await prisma.dish.upsert({
          where: { name: ai.name },
          create: {
            name: ai.name,
            source: "AI_GENERATED",
            cuisine: "家常菜",
            difficulty: 3,
            totalMinutes: 20,
          },
          update: {},
        });
        id = created.id;
        dishNameToId.set(ai.name, id);
      }
      ensureDishIds.push({ name: ai.name, id });
    }

    await prisma.menu.create({
      data: {
        sessionId,
        strategy: plan.strategy,
        status: "DRAFT",
        tag: plan.tag,
        reasoning: plan.reasoning,
        totalMinutes: plan.estimatedMinutes,
        difficulty: plan.difficulty,
        risks: plan.risks,
        dishes: {
          create: plan.dishes.map((ai, dIdx) => ({
            dishId: ensureDishIds[dIdx].id,
            dishNameSnapshot: ai.name,
            position: dIdx,
            usedInventory: ai.usedFromInventory,
            missingIngredients: ai.missingIngredients,
          })),
        },
      },
    });
  }

  await prisma.mealSession.update({
    where: { id: sessionId },
    data: { status: "PLANNING" },
  });

  revalidatePath(`/cook/${sessionId}`);
  return { ok: true as const, count: aiOutput.plans.length };
}

function mapAIErrorToChinese(e: unknown): string {
  if (!(e instanceof Error)) return "AI 推荐失败，请稍后重试";
  const msg = e.message ?? "";
  const name = e.name ?? "";
  if (name === "AbortError" || /aborted|timeout/i.test(msg)) {
    return "AI 响应超时，请稍后再试（可能模型在思考较复杂的菜单）";
  }
  if (/json|parse|schema|zod/i.test(msg)) {
    return "AI 返回格式异常，请重新生成";
  }
  if (/5\d\d|server error|service unavailable/i.test(msg)) {
    return "AI 服务暂时不可用，请稍后重试";
  }
  if (/401|403|api[_ ]?key|unauthorized/i.test(msg)) {
    return "AI 服务认证失败，请检查 API Key 配置";
  }
  if (/429|rate limit|too many/i.test(msg)) {
    return "AI 请求过于频繁，稍等一分钟再试";
  }
  if (/network|fetch failed|econnreset|enotfound/i.test(msg)) {
    return "网络连接异常，请检查网络后重试";
  }
  return "AI 推荐失败，请稍后重试";
}

function deriveDesiredStructure(adults: number, kids: number, hasGuest: boolean): string {
  const total = adults + kids + (hasGuest ? 2 : 0);
  if (total <= 1) return "2 菜 1 汤";
  if (total <= 3) return "3 菜 1 汤";
  if (total <= 5) return "4 菜 1 汤";
  return "5 菜 1 汤";
}

/**
 * 第一步：厨师选中某套方案进入"调整中"。其它 DRAFT 归档。
 * 不生成采购清单/时间线（避免反复重算）。
 */
export async function selectMenuPlanAction(menuId: string) {
  const familyId = await requireFamilyId();
  const user = await requireUser();
  const menu = await prisma.menu.findFirst({
    where: { id: menuId, session: { familyId } },
    include: { session: true },
  });
  if (!menu) return { ok: false as const, error: "菜单不存在" };
  if (menu.session.chefId !== user.id) {
    return { ok: false as const, error: "只有当日厨师可以选定方案" };
  }

  await prisma.$transaction([
    prisma.menu.update({
      where: { id: menuId },
      data: { status: "EDITING" },
    }),
    prisma.menu.updateMany({
      where: { sessionId: menu.sessionId, id: { not: menuId }, status: "DRAFT" },
      data: { status: "ARCHIVED" },
    }),
    // session 维持 PLANNING（厨师还在调整菜单，没真正确认）
  ]);

  revalidatePath(`/cook/${menu.sessionId}`);
  return { ok: true as const, sessionId: menu.sessionId };
}

/**
 * 第二步：厨师增菜
 */
export async function addDishToMenuAction(menuId: string, dishId: string) {
  const familyId = await requireFamilyId();
  const user = await requireUser();
  const menu = await prisma.menu.findFirst({
    where: { id: menuId, session: { familyId } },
    include: { session: true, dishes: true },
  });
  if (!menu) return { ok: false as const, error: "菜单不存在" };
  if (menu.session.chefId !== user.id) {
    return { ok: false as const, error: "只有当日厨师可以编辑菜单" };
  }
  if (menu.status !== "EDITING") {
    return { ok: false as const, error: "只能编辑 EDITING 状态的菜单" };
  }
  if (menu.dishes.some((d) => d.dishId === dishId)) {
    return { ok: false as const, error: "这道菜已经在菜单里了" };
  }
  const dish = await prisma.dish.findUnique({ where: { id: dishId } });
  if (!dish) return { ok: false as const, error: "菜品不存在" };

  await prisma.menuDish.create({
    data: {
      menuId,
      dishId,
      dishNameSnapshot: dish.name,
      position: menu.dishes.length,
      servings: dish.servings,
      isAddedManually: true,
    },
  });

  revalidatePath(`/cook/${menu.sessionId}`);
  return { ok: true as const };
}

/**
 * 第二步：厨师减菜
 */
export async function removeMenuDishAction(menuDishId: string) {
  const familyId = await requireFamilyId();
  const user = await requireUser();
  const md = await prisma.menuDish.findUnique({
    where: { id: menuDishId },
    include: { menu: { include: { session: true } } },
  });
  if (!md || md.menu.session.familyId !== familyId) {
    return { ok: false as const, error: "菜品不存在" };
  }
  if (md.menu.session.chefId !== user.id) {
    return { ok: false as const, error: "只有当日厨师可以编辑菜单" };
  }
  if (md.menu.status !== "EDITING") {
    return { ok: false as const, error: "只能编辑 EDITING 状态的菜单" };
  }
  await prisma.menuDish.delete({ where: { id: menuDishId } });
  revalidatePath(`/cook/${md.menu.sessionId}`);
  return { ok: true as const };
}

/**
 * 第三步：最终确认菜单 → 生成采购清单 + 做饭时间线。
 * - Menu.status: EDITING|DRAFT → CONFIRMED
 * - Session.status: → CONFIRMED
 */
export async function finalizeMenuAction(menuId: string) {
  const familyId = await requireFamilyId();
  const user = await requireUser();
  const menu = await prisma.menu.findFirst({
    where: { id: menuId, session: { familyId } },
    include: { session: true, dishes: true },
  });
  if (!menu) return { ok: false as const, error: "菜单不存在" };
  if (menu.session.chefId !== user.id) {
    return { ok: false as const, error: "只有当日厨师可以确认菜单" };
  }
  if (menu.dishes.length === 0) {
    return { ok: false as const, error: "菜单为空，至少需要 1 道菜" };
  }

  await prisma.$transaction([
    prisma.menu.update({
      where: { id: menuId },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
    }),
    prisma.menu.updateMany({
      where: {
        sessionId: menu.sessionId,
        id: { not: menuId },
        status: { in: ["DRAFT", "EDITING"] },
      },
      data: { status: "ARCHIVED" },
    }),
    prisma.mealSession.update({
      where: { id: menu.sessionId },
      data: { status: "CONFIRMED" },
    }),
  ]);

  try {
    await ensureRecipesForMenu(menuId);
    await generateShoppingListForMenu(menuId);
    await generateCookingPlanForMenu(menuId);
  } catch (e) {
    console.error("[finalizeMenu] 生成附属计划失败:", e);
  }

  revalidatePath(`/cook/${menu.sessionId}`);
  return { ok: true as const, sessionId: menu.sessionId };
}

/** 兼容旧 UI 的合并入口：选定 + 立即最终确认（一步到位） */
export async function confirmMenuAction(menuId: string) {
  const selectResult = await selectMenuPlanAction(menuId);
  if (!selectResult.ok) return selectResult;
  return finalizeMenuAction(menuId);
}

export async function startCookingAction(sessionId: string) {
  const familyId = await requireFamilyId();
  const user = await requireUser();
  const session = await prisma.mealSession.findFirst({
    where: { id: sessionId, familyId },
    select: { chefId: true, status: true },
  });
  if (!session) return { ok: false as const, error: "Session 不存在" };
  if (session.chefId !== user.id) {
    return { ok: false as const, error: "只有当日厨师可以开始做饭" };
  }
  if (session.status !== "CONFIRMED") {
    return { ok: false as const, error: "当前状态不能开始做饭" };
  }
  await prisma.mealSession.update({
    where: { id: sessionId },
    data: { status: "COOKING" },
  });
  revalidatePath(`/cook/${sessionId}`);
  return { ok: true as const };
}

export async function finishCookingAction(sessionId: string) {
  const familyId = await requireFamilyId();
  const user = await requireUser();
  const result = await prisma.mealSession.findFirst({
    where: { id: sessionId, familyId },
    include: { menus: { where: { status: "CONFIRMED" }, include: { dishes: true } } },
  });
  if (!result) return { ok: false as const, error: "Session 不存在" };
  if (result.chefId !== user.id) {
    return { ok: false as const, error: "只有当日厨师可以完成做饭" };
  }

  await prisma.mealSession.update({
    where: { id: sessionId },
    data: { status: "DONE" },
  });

  // 更新 FamilyDish 的烹饪计数与最近烹饪时间
  const confirmedMenu = result.menus[0];
  if (confirmedMenu) {
    for (const md of confirmedMenu.dishes) {
      await prisma.familyDish.upsert({
        where: {
          familyId_dishId: { familyId, dishId: md.dishId },
        },
        create: {
          familyId,
          dishId: md.dishId,
          status: "LOVED",
          cookCount: 1,
          lastCookedAt: new Date(),
        },
        update: {
          cookCount: { increment: 1 },
          lastCookedAt: new Date(),
        },
      });
    }
  }

  revalidatePath(`/cook/${sessionId}`);
  return { ok: true as const };
}
