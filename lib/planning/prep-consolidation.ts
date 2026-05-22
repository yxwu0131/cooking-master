// 跨菜「按食材/工序」合并备菜：把多道菜的备菜横向统筹成统一清单，
// 而不是按单菜一条条罗列。规则化生成骨架（确定、零 AI 成本），
// AI hint 由调用方可选补一句人话（见 generateCookingPlanForMenu）。

export type PrepItem = {
  ingredient: string; // canonical 食材名
  totalText: string; // 聚合总量，如 "共 3 个" / "共 300g"
  forDishes: { dish: string; amount: string }[]; // 分给哪些菜 + 各自用量
};

export type PrepGroupKind = "RICE" | "SOAK" | "MARINATE" | "WASH_CUT" | "BLANCH";

export type PrepGroup = {
  kind: PrepGroupKind;
  title: string;
  module: 1 | 2; // 归到时间线模块一(启动等待)还是模块二(集中备菜)
  hint: string;
  items: PrepItem[];
};

export type PrepPlan = {
  aiHint?: string | null;
  groups: PrepGroup[];
};

type RecipeIngredient = {
  name: string;
  quantity: number;
  unit: string;
  optional?: boolean;
};

type RecipeStepLite = { action: string; stepType?: string };

export type DishForPrep = {
  name: string;
  servings: number; // 本次份数
  dishServings: number; // 菜谱基准份数
  isStaple: boolean;
  ingredients: RecipeIngredient[];
  steps: RecipeStepLite[];
};

export type IngredientCatalogEntry = {
  name: string;
  aliases: string[];
  category: string | null;
};

// 需要提前泡发/解冻的干货
const DRY_GOODS =
  /木耳|银耳|香菇|花菇|冬菇|腐竹|腐皮|粉丝|粉条|红薯粉|黄花菜|金针|虾米|海米|虾皮|海带|裙带|紫菜|笋干|茶树菇|干贝|墨鱼干|鱿鱼干|香菇干|黄豆|绿豆|红豆|花生|莲子|银鱼干/;

// 蛋白质（用于"集中腌制"识别主料）
const PROTEIN =
  /猪|牛|羊|鸡|鸭|鹅|鱼|虾|蟹|肉|排骨|里脊|五花|梅花|腩|腱|胸|腿|翅|蹄|肝|腰|肚|丸|虾仁|鱿鱼|墨鱼|带鱼|鲈|鲫|草鱼|龙利|巴沙|豆腐|豆干|鸡蛋|鸭蛋/;

function scaleQty(q: number, dish: DishForPrep): number {
  const factor = dish.servings / (dish.dishServings || 2);
  return q * factor;
}

function fmtAmount(q: number, unit: string): string {
  const r = Math.round(q * 10) / 10;
  return `${r}${unit}`;
}

/**
 * 规则化生成跨菜备菜清单骨架。
 */
export function buildPrepPlan(
  dishes: DishForPrep[],
  catalog: IngredientCatalogEntry[]
): PrepPlan {
  const aliasToCanonical = new Map<string, string>();
  for (const c of catalog) {
    aliasToCanonical.set(c.name, c.name);
    for (const a of c.aliases) aliasToCanonical.set(a, c.name);
  }
  const canonical = (raw: string) => aliasToCanonical.get(raw) ?? raw;

  const groups: PrepGroup[] = [];

  // ---- 模块一：主食（一次煮好） ----
  const stapleDishes = dishes.filter((d) => d.isStaple);
  if (stapleDishes.length) {
    groups.push({
      kind: "RICE",
      title: "先煮主食",
      module: 1,
      hint: "主食最占时间，开锅就能不管它——第一件事先开起来",
      items: stapleDishes.map((d) => ({
        ingredient: d.name,
        totalText: `${d.servings} 人份`,
        forDishes: [{ dish: d.name, amount: `${d.servings} 人份` }],
      })),
    });
  }

  // ---- 模块一：提前泡发（干货） ----
  const soakMap = new Map<string, PrepItem>();
  for (const d of dishes) {
    for (const ing of d.ingredients) {
      if (!DRY_GOODS.test(ing.name)) continue;
      const name = canonical(ing.name);
      const item: PrepItem = soakMap.get(name) ?? { ingredient: name, totalText: "", forDishes: [] };
      item.forDishes.push({ dish: d.name, amount: fmtAmount(scaleQty(ing.quantity, d), ing.unit) });
      soakMap.set(name, item);
    }
  }
  if (soakMap.size) {
    groups.push({
      kind: "SOAK",
      title: "提前泡发 / 解冻",
      module: 1,
      hint: "干货泡发要时间，和煮饭一起最先做；冷冻肉也提前拿出来化",
      items: [...soakMap.values()],
    });
  }

  // ---- 模块一：集中腌制（有腌制步骤的菜，取其蛋白主料） ----
  const marinateItems: PrepItem[] = [];
  // 记录已进腌制组的 (菜::食材)，避免它们在"统一洗切"里重复出现（腌制本身已含切配）
  const marinated = new Set<string>();
  for (const d of dishes) {
    const needMarinate = d.steps.some(
      (s) => s.stepType === "MARINATE" || /腌制|腌(?!好)/.test(s.action)
    );
    if (!needMarinate) continue;
    const proteins = d.ingredients.filter((ing) => PROTEIN.test(ing.name) && !DRY_GOODS.test(ing.name));
    const target = proteins.length ? proteins : d.ingredients.slice(0, 1);
    for (const ing of target) {
      marinated.add(`${d.name}::${canonical(ing.name)}`);
      marinateItems.push({
        ingredient: canonical(ing.name),
        totalText: fmtAmount(scaleQty(ing.quantity, d), ing.unit),
        forDishes: [{ dish: d.name, amount: fmtAmount(scaleQty(ing.quantity, d), ing.unit) }],
      });
    }
  }
  if (marinateItems.length) {
    groups.push({
      kind: "MARINATE",
      title: "集中腌制",
      module: 1,
      hint: "要腌的肉一次性切好、抓匀、放着入味，等下锅时就省事",
      items: marinateItems,
    });
  }

  // ---- 模块二：统一洗切备菜（按食材聚合，跨菜合并同种食材） ----
  // 排除：主食、干货（已在上面处理）
  type Agg = { units: Map<string, number>; forDishes: { dish: string; amount: string }[] };
  const washMap = new Map<string, Agg>();
  for (const d of dishes) {
    if (d.isStaple) continue;
    for (const ing of d.ingredients) {
      if (DRY_GOODS.test(ing.name)) continue;
      const name = canonical(ing.name);
      if (marinated.has(`${d.name}::${name}`)) continue; // 已在"集中腌制"里处理
      const qty = scaleQty(ing.quantity, d);
      const agg: Agg = washMap.get(name) ?? { units: new Map<string, number>(), forDishes: [] };
      agg.units.set(ing.unit, (agg.units.get(ing.unit) ?? 0) + qty);
      agg.forDishes.push({ dish: d.name, amount: fmtAmount(qty, ing.unit) });
      washMap.set(name, agg);
    }
  }
  const washItems: PrepItem[] = [...washMap.entries()].map(([name, agg]) => ({
    ingredient: name,
    totalText:
      "共 " +
      [...agg.units.entries()].map(([u, q]) => fmtAmount(q, u)).join(" + "),
    forDishes: agg.forDishes,
  }));
  // 跨多道菜用到的食材排前面（最值得一次性备好）
  washItems.sort((a, b) => b.forDishes.length - a.forDishes.length);
  if (washItems.length) {
    groups.push({
      kind: "WASH_CUT",
      title: "统一洗切备菜（按食材）",
      module: 2,
      hint: "同一种食材一次切好分到各菜，别边炒边切；切完按下锅顺序摆盘",
      items: washItems,
    });
  }

  // ---- 模块二：焯水批次 ----
  const blanchDishes = dishes.filter((d) =>
    d.steps.some((s) => s.stepType === "BLANCH" || /焯水|焯一下|汆/.test(s.action))
  );
  if (blanchDishes.length) {
    groups.push({
      kind: "BLANCH",
      title: "焯水批次",
      module: 2,
      hint: "需要焯水的食材一锅水分批焯（先素后荤），省水省时",
      items: blanchDishes.map((d) => ({
        ingredient: d.name,
        totalText: "",
        forDishes: [{ dish: d.name, amount: "" }],
      })),
    });
  }

  return { groups };
}
