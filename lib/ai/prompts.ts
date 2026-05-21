import type { MenuRecommendInput, RecipeGenerateInput, WishToDishInput } from "./types";

/**
 * 共用系统提示词：定义 AI 的角色与回答规则
 */
export const SYSTEM_PROMPT = `你是「厨神」，一个专为中国家庭服务的家庭做饭规划助手。

你的核心原则：
1. **以家庭为中心**：每个家庭有不同的口味、成员、厨房条件，你必须严格遵循输入档案
2. **优先利用已有食材**：尤其是快过期的，避免浪费
3. **避开禁忌**：成员的过敏、不爱吃的、家庭屏蔽的菜，绝不出现
4. **结构化输出**：所有回复必须是有效的 JSON，不要包含任何 markdown 围栏（如 \`\`\`json）或解释文字
5. **中国家常视角**：菜名用中文常见叫法，菜谱步骤实用、火候明确
6. **不要重复**：避开「最近吃过」列表里的菜
7. **匹配能力**：根据厨师熟练度和厨房条件，难度不超过 maxComplexity

输出的 JSON 必须严格符合用户给出的 schema，不要多字段也不要少字段。`;

/**
 * 菜单推荐提示词
 */
export function menuRecommendPrompt(input: MenuRecommendInput): string {
  const requests = input.requests.length
    ? input.requests
        .map((r) => `- [${r.type === "SPECIFIC_DISH" ? "具体" : "模糊"}] ${r.content}${r.from ? `（${r.from}）` : ""}`)
        .join("\n")
    : "（无）";

  const inventory = input.inventory.length
    ? input.inventory
        .map((i) => `- ${i.name} ${i.quantity}${i.unit}${i.expiringSoon ? " [快过期]" : ""}`)
        .join("\n")
    : "（库存为空）";

  const members = input.members
    .map(
      (m) =>
        `- ${m.name}（${m.ageGroup}${m.isChild ? "/小孩" : ""}${m.isElder ? "/老人" : ""}），辣度${m.spicyTolerance}/5，咸淡${m.saltPreference}` +
        (m.dislikes.length ? `，不爱：${m.dislikes.join("、")}` : "") +
        (m.allergies.length ? `，过敏：${m.allergies.join("、")}` : "") +
        (m.favorites.length ? `，爱吃：${m.favorites.join("、")}` : "")
    )
    .join("\n");

  const preferredDishes = input.preferredFamilyDishes.length
    ? input.preferredFamilyDishes
        .slice(0, 30)
        .map((d) => `- ${d.name}（${d.status}，做过${d.cookCount}次）`)
        .join("\n")
    : "（暂未标记）";

  const availableDishes = input.availableDishes
    .slice(0, 60)
    .map(
      (d) =>
        `- ${d.name}（${d.cuisine ?? "家常"}，${d.totalMinutes}分钟，难度${d.difficulty}${d.isSpicy ? "，辣" : ""}${d.isSoup ? "，汤" : ""}${d.isLight ? "，清淡" : ""}${d.isHearty ? "，下饭" : ""}${d.isChildFriendly ? "，儿童友好" : ""}）`
    )
    .join("\n");

  const contextFlags = input.session.contextFlags
    ? Object.entries(input.session.contextFlags)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .join("、")
    : "";

  return `请为下面这个家庭推荐今天的${input.session.mealType === "DINNER" ? "晚餐" : input.session.mealType === "LUNCH" ? "午餐" : "餐"}菜单。

<家庭档案>
家庭：${input.family.name}
偏好菜系：${input.family.cuisines.join("、") || "家常菜"}
口味标志：${Object.entries(input.family.tasteFlags).filter(([, v]) => v).map(([k]) => k).join("、") || "无特殊"}
儿童友好：${input.family.childFriendly ? "是" : "否"}
健康目标：${input.family.healthGoals.join("、") || "无"}
</家庭档案>

<家庭成员>
${members}
</家庭成员>

<厨房条件>
厨具：${input.kitchen.cookware.join("、")}
灶眼：${input.kitchen.stoveCount}个
${input.kitchen.hasRiceCooker ? "✓ 电饭锅 " : ""}${input.kitchen.hasSteamer ? "✓ 蒸锅 " : ""}${input.kitchen.hasPressureCooker ? "✓ 高压锅 " : ""}${input.kitchen.hasAirFryer ? "✓ 空气炸锅 " : ""}${input.kitchen.hasOven ? "✓ 烤箱" : ""}
常备调料：${input.kitchen.commonSeasonings.join("、")}
</厨房条件>

<今日厨师>
姓名：${input.chef.name}
熟练度：${input.chef.skillLevel}，最高接受难度 ${input.chef.maxComplexity}/5
（菜单难度不要超过此值；时间线会按此熟练度自动加缓冲）
</今日厨师>

<本次就餐>
${input.session.eaterAdults}大人 + ${input.session.eaterKids}小孩${input.session.hasGuest ? " + 有客人" : ""}
目标耗时：≤${input.session.maxMinutes}分钟
${input.session.needLeftover ? "需要多做留到下顿；" : ""}${input.session.needLunchBox ? "需要带饭；" : ""}
临时标志：${contextFlags || "无"}
</本次就餐>

<家人点菜>
${requests}
</家人点菜>

<当前库存>
${inventory}
</当前库存>

<我家菜谱库（已标记的菜）>
${preferredDishes}
</我家菜谱库（已标记的菜）>

<最近吃过（要避开）>
${input.recentlyCookedNames.join("、") || "（无）"}
</最近吃过（要避开）>

<已屏蔽（绝对不能出现）>
${input.blockedDishNames.join("、") || "（无）"}
</已屏蔽（绝对不能出现）>

<可选菜品库（系统已知的菜，优先从这里选，确实没合适的再原创）>
${availableDishes}
</可选菜品库（系统已知的菜，优先从这里选，确实没合适的再原创）>

请生成 2-3 套不同策略的菜单方案（${input.desiredStructure}），每套方案侧重不同（如：满足家人点菜 / 消耗冰箱 / 快手 / 儿童友好）。

【硬约束：必须有主食】
${["LUNCH", "DINNER"].includes(input.session.mealType) ? "每套方案必须包含至少 1 道主食（白米饭 / 面条 / 馒头 / 饺子 / 粥 / 米粉 / 河粉 等），没有主食的菜单不算完整。如果家里有米就出米饭；想换换口味可以出面食。" : "如果适合该餐次（早餐/加餐），酌情包含主食。"}

【重要原则：覆盖式而非交集式】
不要试图让每道菜都同时满足所有成员的偏好（这会让菜单平淡无味）。
正确做法：**整桌菜里，每个成员都至少有 1-2 道符合 ta 偏好的菜**就够了：
- 爱辣的爸爸：整桌里有 1 道辣菜就行，不需要每道菜都辣
- 不吃辣的小孩：保证至少有 1-2 道不辣的菜
- 老人想清淡：至少 1 道清淡的菜
- 任何成员的过敏/绝对禁忌：所有菜都必须避开（这是硬约束）
对于每套方案，在 reasoning 里说清楚"谁吃哪道菜"（如：辣的红烧肉给爸爸，清炒虾仁孩子吃，番茄蛋汤老人喝）。

输出严格 JSON：
{
  "plans": [
    {
      "tag": "方案A · 名称",
      "strategy": "BALANCED | SATISFY_REQUESTS | USE_INVENTORY | QUICK | KID_FRIENDLY | WEEKEND_TREAT",
      "dishes": [
        {
          "name": "菜名",
          "reason": "为什么选这道菜（1句话）",
          "usedFromInventory": ["用到的库存食材1", "用到的库存食材2"],
          "missingIngredients": [{"name": "需要买的食材", "quantity": 数量, "unit": "单位"}]
        }
      ],
      "reasoning": "本方案整体思路（1-2句话）",
      "estimatedMinutes": 总耗时数字,
      "difficulty": 难度数字1-5,
      "risks": ["风险/注意事项1", "风险/注意事项2"]
    }
  ]
}

风险提醒可能包括：太辣、耗时过长、菜品重复、缺少蔬菜、营养不均衡、锅具不够等。`;
}

/**
 * 菜谱生成提示词
 */
export function recipeGeneratePrompt(input: RecipeGenerateInput): string {
  return `为以下菜品生成完整菜谱（${input.servings}人份）：

菜名：${input.dishName}
${input.noSpicy ? "约束：不能放辣\n" : ""}${input.lowOilSalt ? "约束：少油少盐\n" : ""}可用调料：${input.availableSeasonings.join("、") || "常见调料"}

输出严格 JSON：
{
  "cuisine": "菜系（家常菜/川菜/粤菜/...）",
  "totalMinutes": 总耗时数字,
  "difficulty": 1-5,
  "isSpicy": true/false,
  "isVegetarian": true/false,
  "isSoup": true/false,
  "requiredCookware": ["炒锅", "汤锅"],
  "mainIngredients": ["主料1", "主料2"],
  "ingredients": [{"name": "食材", "quantity": 数量, "unit": "g/个/把/块", "optional": true/false}],
  "seasonings": [{"name": "调料", "quantity": 数量, "unit": "g/ml"}],
  "steps": [
    {
      "order": 1,
      "action": "步骤描述",
      "durationMinutes": 分钟数,
      "stepType": "PREP|MARINATE|SOAK|BLANCH|BOIL|STEAM|STIR_FRY|DEEP_FRY|BRAISE|REDUCE|PLATE|CLEAN",
      "heat": "大火|中火|小火",
      "cookware": "炒锅",
      "parallel": false,
      "dependsOn": [前置步骤order数组]
    }
  ],
  "tips": ["注意事项1", "注意事项2"],
  "heatNotes": "火候说明（1-2句）"
}`;
}

/**
 * 灵感 → 完整菜品提示词。
 * 如果用户给了 manualRecipe，AI 必须优先沿用其中描述的食材、份量、火候、步骤，
 * 仅做缺失字段补全和结构规范化，不要擅自换主料或风味。
 */
export function wishToDishPrompt(input: WishToDishInput): string {
  const hasManual = !!input.manualRecipe?.trim();
  return `用户灵感：${input.rawWish}
${hasManual ? `\n用户已写的做法草稿（优先沿用其中信息，不要擅自替换主料/火候/调味）：\n"""\n${input.manualRecipe}\n"""\n` : "\n（用户未提供做法，请你按家常做法补全。）\n"}
约束：${input.servings}人份${input.noSpicy ? "；不能放辣" : ""}${input.lowOilSalt ? "；少油少盐" : ""}
可用调料：${input.availableSeasonings.join("、") || "常见调料"}

输出严格 JSON（必须包含 dishName + 完整菜谱字段）：
{
  "dishName": "标准化菜名（中文常见叫法）",
  "cuisine": "菜系（家常菜/川菜/...）",
  "totalMinutes": 数字,
  "difficulty": 1-5,
  "isSpicy": true/false,
  "isVegetarian": true/false,
  "isSoup": true/false,
  "requiredCookware": ["炒锅", ...],
  "mainIngredients": ["主料1", "主料2"],
  "ingredients": [{"name":"","quantity":数字,"unit":"g/个/把/块","optional":可选}],
  "seasonings":  [{"name":"","quantity":数字,"unit":"g/ml"}],
  "steps": [
    {"order":1,"action":"步骤描述","durationMinutes":数字,"stepType":"PREP|MARINATE|SOAK|BLANCH|BOIL|STEAM|STIR_FRY|DEEP_FRY|BRAISE|REDUCE|PLATE|CLEAN","heat":"大火|中火|小火","cookware":"炒锅","parallel":false,"dependsOn":[]}
  ],
  "tips": ["注意事项"],
  "heatNotes": "火候说明"
}

如果用户草稿里步骤模糊，你可以拆细，但不要凭空换主料；如果草稿和约束冲突（如草稿放辣但约束不能辣），按约束优先并在 tips 里说明替换方案。`;
}

/**
 * 灵感解析提示词
 */
export function wishParsePrompt(raw: string): string {
  return `用户说："${raw}"

请识别出菜品名称。输出 JSON：
{
  "dishName": "标准化菜名（如「番茄牛腩」）",
  "cuisine": "菜系",
  "mainIngredients": ["主料1", "主料2"],
  "confidence": 0-1 的数字（用户表达越明确越高）
}

如果无法识别具体菜品，dishName 填最可能的菜名，confidence 设为 0.3。`;
}
