import { prisma } from "@/lib/db";
import type { StepType } from "@prisma/client";

type RecipeStep = {
  order: number;
  action: string;
  durationMinutes: number;
  stepType?: string;
  heat?: string;
  cookware?: string;
  parallel?: boolean;
  dependsOn?: number[];
};

type ScheduledStep = {
  order: number;
  startMinute: number;
  durationMinutes: number;
  action: string;
  dishName: string;
  cookware: string | null;
  heat: string | null;
  isParallel: boolean;
  dependsOn: number[];
  stepType: StepType | null;
  reminders: string[];
};

type Stage = "prep" | "slow" | "fast";

const LEAFY_KEYWORDS = ["菠菜", "空心菜", "生菜", "白菜", "娃娃菜", "上海青", "油菜", "茼蒿", "莴笋叶", "苋菜", "韭菜"];
const SLOW_APPLIANCES = /电饭锅|电压力锅|压力锅|高压锅|慢炖锅|烤箱|空气炸锅|蒸锅/;
const STOVE_COOKWARE = /炒锅|平底锅|汤锅|奶锅|蒸锅(\?)?$/; // 蒸锅放炉上时占灶；但视为 slow（启动后不动）

/**
 * 推断步骤类型（如果 recipe 没明确标 stepType，按 action 关键词兜底）。
 */
function inferStepType(action: string): StepType {
  const a = action;
  if (/切|洗|拍|剁|去皮|去骨|去核|去蒂|清洗/.test(a)) return "PREP";
  if (/腌制|腌|抓|拌匀.*静置/.test(a)) return "MARINATE";
  if (/泡发|浸泡|泡软/.test(a)) return "SOAK";
  if (/焯水|焯一下/.test(a)) return "BLANCH";
  if (/蒸/.test(a)) return "STEAM";
  if (/炖|焖|烧/.test(a) && !/翻炒|爆炒/.test(a)) return "BRAISE";
  if (/收汁|大火收汁/.test(a)) return "REDUCE";
  if (/炸/.test(a)) return "DEEP_FRY";
  if (/炒|翻炒|爆炒/.test(a)) return "STIR_FRY";
  if (/煮/.test(a)) return "BOIL";
  if (/装盘|出锅/.test(a)) return "PLATE";
  if (/清/.test(a)) return "CLEAN";
  return "STIR_FRY";
}

/**
 * 把步骤归入 prep / slow / fast 三阶段。
 * - prep：不占灶不占专注（切配/腌制/泡发/装盘/清洁）
 * - slow：长耗时但启动后可放着（电饭锅、压力锅、炖煮、蒸）
 * - fast：占灶 + 占人手的关键烹饪（炒/快煮/焯/炸/收汁）
 */
function stageOf(step: RecipeStep, type: StepType): Stage {
  switch (type) {
    case "PREP":
    case "MARINATE":
    case "SOAK":
    case "PLATE":
    case "CLEAN":
      return "prep";
    case "BRAISE":
      return "slow";
    case "STEAM":
      // 蒸 + 蒸锅 = slow（盖盖子放着）；蒸时间 < 10min 视为 fast
      return step.durationMinutes >= 10 ? "slow" : "fast";
    case "BOIL": {
      const c = step.cookware ?? "";
      if (SLOW_APPLIANCES.test(c)) return "slow";
      // 煮饭/煲汤通常 30min+，视为 slow；普通煮（如下面条）视为 fast
      return step.durationMinutes >= 20 ? "slow" : "fast";
    }
    case "BLANCH":
    case "STIR_FRY":
    case "DEEP_FRY":
    case "REDUCE":
      return "fast";
    default:
      return "fast";
  }
}

/**
 * 估算每道菜的"完成偏移"（相对上桌时间的负数分钟）：
 * - 叶菜炒菜：-2  出锅就上
 * - 汤：-3
 * - 一般炒菜：-5
 * - 蒸菜：-5
 * - 凉菜：-12（可以早做）
 * - 红烧/炖菜：-10（可保温，离上桌远些不烫嘴）
 * - 米饭：-8（电饭锅煮完保温几分钟最好吃）
 */
function dishFinishOffset(dish: {
  name: string;
  isSoup: boolean;
  isStaple: boolean;
  isLeafy: boolean;
  isStew: boolean;
  isCold: boolean;
  isSteam: boolean;
  totalMinutes: number;
}): number {
  if (dish.isLeafy) return -2;
  if (dish.isSoup) return -3;
  if (dish.isStaple) return -8;
  if (dish.isCold) return -12;
  if (dish.isStew) return -10;
  if (dish.isSteam) return -5;
  return -5;
}

/**
 * 为已确认的菜单生成做饭时间线（V2：餐馆出餐法）。
 *
 * 核心思想：以「上桌时间」为锚点（offset 0），所有步骤反向倒推：
 *   1. 给每道菜分配 dishFinishOffset（相对上桌，越接近 0 越烫）
 *   2. 把每道菜的步骤分三类：prep（不占灶）/ slow（启动后可放）/ fast（占灶+占人手）
 *   3. 反向调度：dish 的最后一个 cooking step 完成于 dishFinishOffset
 *   4. PREP 步骤集中到前段，按"先做要慢炖菜的"原则
 *   5. 灶位/锅具冲突检测：同时刻 stove 占用 > stoveCount 则 warning
 *
 * 出餐效果：先勤切配 → 启动电饭煲 / 压力锅 / 红烧 → 一般炒菜 → 汤 → 叶菜压轴
 */
export async function generateCookingPlanForMenu(menuId: string) {
  const menu = await prisma.menu.findUnique({
    where: { id: menuId },
    include: {
      dishes: {
        include: { dish: { include: { recipe: true } } },
        orderBy: { position: "asc" },
      },
      session: true,
    },
  });
  if (!menu) throw new Error("菜单不存在");

  await prisma.cookingPlan.deleteMany({ where: { menuId } });

  const kitchen = await prisma.kitchenProfile.findUnique({
    where: { familyId: menu.session.familyId },
  });
  const stoveCount = kitchen?.stoveCount ?? 2;

  // 取当日厨师对应 FamilyMember 的下厨能力；找不到回落 INTERMEDIATE
  const chefMember = await prisma.familyMember.findFirst({
    where: { familyId: menu.session.familyId, userId: menu.session.chefId },
    select: { cookingSkill: true },
  });
  const skillLevel = chefMember?.cookingSkill ?? "INTERMEDIATE";

  // 新手厨师额外加缓冲：切配慢、火候不稳，所有步骤 ×1.2
  const skillMultiplier = skillLevel === "BEGINNER" ? 1.2 : skillLevel === "ADVANCED" ? 0.9 : 1.0;

  // 1. 准备每道菜的元数据
  const dishes = menu.dishes.map((md) => {
    const rawSteps = ((md.dish.recipe?.steps as RecipeStep[] | null) ?? [])
      .slice()
      .sort((a, b) => a.order - b.order);
    const tags = md.dish.tags ?? [];
    const isLeafy =
      md.dish.mainIngredients.some((n) => LEAFY_KEYWORDS.some((leaf) => n.includes(leaf))) ||
      LEAFY_KEYWORDS.some((leaf) => md.dish.name.includes(leaf));
    const isStew = tags.includes("红烧") || tags.includes("炖") || /红烧|炖|焖/.test(md.dish.name);
    const isCold = tags.includes("凉菜") || /凉拌|冷盘|沙拉/.test(md.dish.name);
    const isSteam = tags.includes("蒸") || /蒸/.test(md.dish.name);
    const meta = {
      name: md.dishNameSnapshot,
      isSoup: md.dish.isSoup,
      isStaple: md.dish.isStaple,
      isLeafy,
      isStew,
      isCold,
      isSteam,
      totalMinutes: md.dish.totalMinutes,
    };
    return {
      id: md.id,
      ...meta,
      finishOffset: dishFinishOffset(meta),
      steps: rawSteps.map((s) => {
        const type = (s.stepType as StepType) ?? inferStepType(s.action);
        return {
          ...s,
          stepType: type,
          durationMinutes: Math.max(1, Math.round(s.durationMinutes * skillMultiplier)),
          stage: stageOf(s, type),
        };
      }),
    };
  });

  // 2. 对每道菜反向倒推：把它的 cooking steps（非 prep）按从后往前排
  //    prep steps 先归入"prep 池"，统一调度到前段
  type PlannedStep = {
    dishId: string;
    dishName: string;
    type: StepType;
    stage: Stage;
    action: string;
    durationMinutes: number;
    startOffset: number; // 相对上桌的偏移（负数 = 上桌前 N 分钟）
    cookware: string | null;
    heat: string | null;
    reminders: string[];
    sourceOrder: number; // 原 recipe 内步骤序号，用于 dependency
    dishLatestStart: number; // 该菜内最早 cooking step 的 startOffset（让 prep 别拖到它后面）
  };

  const planned: PlannedStep[] = [];

  for (const dish of dishes) {
    const cookingSteps = dish.steps.filter((s) => s.stage !== "prep");
    const prepSteps = dish.steps.filter((s) => s.stage === "prep");

    // 该菜的最后一个 cooking step 完成于 dish.finishOffset
    // 从后往前依次倒推
    let cursor = dish.finishOffset;
    const cookingPlanned: PlannedStep[] = [];
    for (let i = cookingSteps.length - 1; i >= 0; i--) {
      const s = cookingSteps[i];
      const startOffset = cursor - s.durationMinutes;
      cookingPlanned.push({
        dishId: dish.id,
        dishName: dish.name,
        type: s.stepType,
        stage: s.stage,
        action: s.action,
        durationMinutes: s.durationMinutes,
        startOffset,
        cookware: s.cookware ?? null,
        heat: s.heat ?? null,
        reminders: stepReminders(s, dish),
        sourceOrder: s.order,
        dishLatestStart: 0, // 占位，下一步填
      });
      cursor = startOffset; // 上一步必须在这步开始前完成
    }

    const dishCookingStart = cookingPlanned.length
      ? Math.min(...cookingPlanned.map((p) => p.startOffset))
      : dish.finishOffset;

    cookingPlanned.forEach((p) => (p.dishLatestStart = dishCookingStart));
    planned.push(...cookingPlanned);

    // PREP 步骤：归入 prep 池，要求 endOffset <= dishCookingStart（cooking 开始时切配必须完成）
    for (const s of prepSteps) {
      planned.push({
        dishId: dish.id,
        dishName: dish.name,
        type: s.stepType,
        stage: "prep",
        action: s.action,
        durationMinutes: s.durationMinutes,
        startOffset: 0, // 占位
        cookware: s.cookware ?? null,
        heat: s.heat ?? null,
        reminders: stepReminders(s, dish),
        sourceOrder: s.order,
        dishLatestStart: dishCookingStart,
      });
    }
  }

  // 3. 调度 PREP 池：单人手工作流，先做"最早需要下锅的菜"的 prep
  //    按 dishLatestStart 升序（越早开火的菜越先切配）
  const prepPool = planned
    .filter((p) => p.stage === "prep")
    .sort((a, b) => a.dishLatestStart - b.dishLatestStart);

  // prep 全部串行排在 cookStart 之前。先算总 prep 时长
  const totalPrepMinutes = prepPool.reduce((s, p) => s + p.durationMinutes, 0);
  const earliestCookStart = Math.min(
    ...planned.filter((p) => p.stage !== "prep").map((p) => p.startOffset),
    0
  );
  // prep 开始时间 = earliestCookStart - totalPrepMinutes（确保 prep 串行结束时第一道菜可以开火）
  let prepCursor = earliestCookStart - totalPrepMinutes;
  for (const p of prepPool) {
    p.startOffset = prepCursor;
    prepCursor += p.durationMinutes;
  }
  // 但要确保 prep 不晚于其菜的 cooking 开始：用 latest start 约束兜底
  // （理论上 sort by dishLatestStart 已保证，这里 double-check 即可）

  // 4. 灶位冲突检测（slow 阶段的电饭锅/压力锅不算灶；fast 阶段才占灶）
  const fastSteps = planned.filter((p) => p.stage === "fast");
  const maxConcurrentStove = countMaxConcurrentStove(fastSteps);

  // 5. 计算 origin：最早 startOffset 的绝对值 = 总耗时
  const earliest = Math.min(...planned.map((p) => p.startOffset), 0);
  const totalMinutes = Math.max(15, Math.ceil(-earliest));

  // 把 offset 转成正数 startMinute（origin = totalMinutes - |offset|）
  const allSteps: ScheduledStep[] = planned
    .slice()
    .sort((a, b) => a.startOffset - b.startOffset)
    .map((p, idx) => ({
      order: idx + 1,
      startMinute: Math.round(totalMinutes + p.startOffset),
      durationMinutes: p.durationMinutes,
      action: p.action,
      dishName: p.dishName,
      cookware: p.cookware,
      heat: p.heat,
      isParallel: p.stage === "slow" || p.stage === "prep", // 切配/慢炖期间可并行做别的
      dependsOn: [],
      stepType: p.type,
      reminders: p.reminders,
    }));

  const targetTime = menu.session.targetTime;
  const startAt = new Date(targetTime.getTime() - totalMinutes * 60 * 1000);

  // 6. 策略描述（餐馆出餐三阶段）
  const strategy = buildStrategyText(dishes);

  // 7. 风险与提醒
  const warnings: string[] = [];
  if (maxConcurrentStove > stoveCount) {
    warnings.push(
      `部分时段需要 ${maxConcurrentStove} 个灶眼同时使用，超过厨房的 ${stoveCount} 个，下面会按可错开顺序提示，必要时延后某道炒菜`
    );
  }
  if (dishes.some((d) => d.isLeafy)) {
    warnings.push("叶菜安排在出餐前 1-2 分钟才下锅，避免出水变黄");
  }
  if (dishes.some((d) => d.isSoup) && totalMinutes > 60) {
    warnings.push("汤如果提前做好了，记得小火保温到上桌，临上桌再撒葱花");
  }
  const stewDish = dishes.find((d) => d.isStew);
  if (stewDish) {
    warnings.push(`「${stewDish.name}」是红烧/炖菜，做完盖盖保温就好，不用频繁加热`);
  }
  if (dishes.length >= 4 && stoveCount <= 2) {
    warnings.push(
      `${dishes.length} 道菜配 ${stoveCount} 个灶眼，要尽量让长耗时的菜走电饭锅/压力锅/烤箱，灶眼留给炒菜`
    );
  }
  if (totalPrepMinutes >= 20) {
    warnings.push(
      `所有切配集中在前 ${totalPrepMinutes} 分钟完成，包括所有菜的食材切好放盘子，再开始下锅`
    );
  }

  await prisma.cookingPlan.create({
    data: {
      menuId,
      totalMinutes,
      startAt,
      endAt: targetTime,
      strategy,
      warnings,
      steps: {
        create: allSteps.map((s) => ({
          order: s.order,
          startMinute: s.startMinute,
          durationMinutes: s.durationMinutes,
          action: s.action,
          dishName: s.dishName,
          cookware: s.cookware,
          heat: s.heat,
          isParallel: s.isParallel,
          dependsOn: s.dependsOn,
          stepType: s.stepType,
          reminders: s.reminders,
        })),
      },
    },
  });
}

function stepReminders(
  step: { stepType: StepType; action: string; durationMinutes: number },
  dish: { isLeafy: boolean; isStew: boolean; isStaple: boolean }
): string[] {
  const r: string[] = [];
  if (step.stepType === "STIR_FRY" && dish.isLeafy) {
    r.push("大火快炒，下锅就翻，30 秒到 1 分钟出锅");
  }
  if (step.stepType === "PREP" && /(肉|鸡|猪|牛|羊|虾|鱼)/.test(step.action)) {
    r.push("处理完生肉，及时清洗砧板和刀具再切菜");
  }
  if (step.stepType === "MARINATE" && step.durationMinutes >= 10) {
    r.push("腌制期间可以去切别的菜，不用等");
  }
  if (step.stepType === "BRAISE") {
    r.push("盖盖小火慢炖，期间可以做别的菜");
  }
  if (step.stepType === "BOIL" && dish.isStaple) {
    r.push("电饭锅煮完会自动保温，米饭水比例 1:1.2");
  }
  if (step.stepType === "STEAM") {
    r.push("水开后再放入蒸，蒸期间不要频繁开盖");
  }
  return r;
}

function buildStrategyText(
  dishes: Array<{
    name: string;
    isSoup: boolean;
    isStaple: boolean;
    isLeafy: boolean;
    isStew: boolean;
    isCold: boolean;
    isSteam: boolean;
    totalMinutes: number;
  }>
): string {
  const parts: string[] = [];
  parts.push("【三阶段】先切配 → 再启动长耗时（饭/炖/蒸）→ 临上桌冲刺炒菜");

  const staple = dishes.find((d) => d.isStaple);
  const stew = dishes.find((d) => d.isStew);
  const steam = dishes.find((d) => d.isSteam);
  const cold = dishes.find((d) => d.isCold);
  const soup = dishes.find((d) => d.isSoup);
  const leafy = dishes.find((d) => d.isLeafy);

  const slowOrder: string[] = [];
  if (staple) slowOrder.push(`先按下「${staple.name}」`);
  if (stew) slowOrder.push(`开火炖「${stew.name}」`);
  if (steam) slowOrder.push(`水开后蒸「${steam.name}」`);
  if (slowOrder.length) parts.push(slowOrder.join("，") + "（启动后不用看着）");

  if (cold) parts.push(`「${cold.name}」可以提前拌好放冰箱`);

  const fastOrder: string[] = [];
  const otherFast = dishes.filter((d) => !d.isStaple && !d.isStew && !d.isCold && !d.isSoup && !d.isLeafy && !d.isSteam);
  for (const d of otherFast) fastOrder.push(`「${d.name}」`);
  if (fastOrder.length) parts.push(`再做${fastOrder.join("、")}（一般炒菜）`);

  if (soup) parts.push(`临上桌前 3-5 分钟完成「${soup.name}」`);
  if (leafy) parts.push(`最后 2 分钟下锅「${leafy.name}」（叶菜出锅即上）`);

  return parts.join("；") + "。";
}

function countMaxConcurrentStove(
  steps: Array<{ startOffset: number; durationMinutes: number; cookware: string | null; stage: Stage }>
): number {
  // 只看 fast 阶段且占灶的步骤
  const stoveSteps = steps.filter((s) => {
    if (s.stage !== "fast") return false;
    const c = s.cookware ?? "";
    if (SLOW_APPLIANCES.test(c)) return false;
    return true;
  });
  if (stoveSteps.length === 0) return 0;

  // 扫描线
  let max = 0;
  const events: Array<{ t: number; delta: number }> = [];
  for (const s of stoveSteps) {
    events.push({ t: s.startOffset, delta: +1 });
    events.push({ t: s.startOffset + s.durationMinutes, delta: -1 });
  }
  events.sort((a, b) => a.t - b.t || a.delta - b.delta);
  let cur = 0;
  for (const e of events) {
    cur += e.delta;
    if (cur > max) max = e.delta > 0 ? cur : max;
  }
  return max;
}
