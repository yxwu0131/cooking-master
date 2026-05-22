import { z } from "zod";

// ============================================================
// 菜单推荐
// ============================================================
export const menuRecommendInputSchema = z.object({
  family: z.object({
    name: z.string(),
    cuisines: z.array(z.string()),
    tasteFlags: z.object({
      light: z.boolean().optional(),
      hearty: z.boolean().optional(),
      lowOilSalt: z.boolean().optional(),
      noSpicy: z.boolean().optional(),
      mildSpicy: z.boolean().optional(),
    }),
    childFriendly: z.boolean(),
    healthGoals: z.array(z.string()),
  }),
  members: z.array(
    z.object({
      name: z.string(),
      ageGroup: z.string(),
      isChild: z.boolean(),
      isElder: z.boolean(),
      dislikes: z.array(z.string()),
      favorites: z.array(z.string()),
      allergies: z.array(z.string()),
      spicyTolerance: z.number(),
      saltPreference: z.string(),
    })
  ),
  kitchen: z.object({
    cookware: z.array(z.string()),
    stoveCount: z.number(),
    hasRiceCooker: z.boolean(),
    hasSteamer: z.boolean(),
    hasPressureCooker: z.boolean(),
    hasAirFryer: z.boolean(),
    hasOven: z.boolean(),
    commonSeasonings: z.array(z.string()),
  }),
  chef: z.object({
    name: z.string(),
    skillLevel: z.string(), // BEGINNER / INTERMEDIATE / ADVANCED
    maxComplexity: z.number(), // 1-5
  }),
  inventory: z.array(
    z.object({
      name: z.string(),
      quantity: z.number(),
      unit: z.string(),
      expiringSoon: z.boolean(),
    })
  ),
  session: z.object({
    mealType: z.string(),
    eaterAdults: z.number(),
    eaterKids: z.number(),
    hasGuest: z.boolean(),
    maxMinutes: z.number(),
    needLeftover: z.boolean(),
    needLunchBox: z.boolean(),
    contextFlags: z.record(z.string(), z.boolean()).optional(),
  }),
  requests: z.array(
    z.object({
      type: z.enum(["SPECIFIC_DISH", "FUZZY"]),
      content: z.string(),
      from: z.string().optional(),
    })
  ),
  preferredFamilyDishes: z.array(
    z.object({
      name: z.string(),
      status: z.string(), // STAPLE/LOVED/WANT_TO_TRY/...
      cookCount: z.number(),
      lastCookedAt: z.string().nullable(),
    })
  ),
  blockedDishNames: z.array(z.string()),
  recentlyCookedNames: z.array(z.string()),
  availableDishes: z.array(
    z.object({
      name: z.string(),
      cuisine: z.string().nullable(),
      isSpicy: z.boolean(),
      isLight: z.boolean(),
      isHearty: z.boolean(),
      isSoup: z.boolean(),
      isVegetarian: z.boolean(),
      isChildFriendly: z.boolean(),
      mainIngredients: z.array(z.string()),
      totalMinutes: z.number(),
      difficulty: z.number(),
    })
  ),
  desiredStructure: z.string(), // "3菜1汤" / "2菜1汤"
});

export type MenuRecommendInput = z.infer<typeof menuRecommendInputSchema>;

export const menuPlanSchema = z.object({
  tag: z.string(), // "方案A · 满足家人" / "方案B · 消耗冰箱"
  strategy: z.enum([
    "BALANCED",
    "SATISFY_REQUESTS",
    "USE_INVENTORY",
    "QUICK",
    "KID_FRIENDLY",
    "WEEKEND_TREAT",
  ]),
  dishes: z
    .array(
      z.object({
        name: z.string(),
        reason: z.string(),
        usedFromInventory: z.array(z.string()),
        missingIngredients: z.array(
          z.object({
            name: z.string(),
            quantity: z.number(),
            unit: z.string(),
          })
        ),
      })
    )
    .min(1)
    .max(6),
  reasoning: z.string(),
  estimatedMinutes: z.number(),
  difficulty: z.number().min(1).max(5),
  risks: z.array(z.string()),
});

export type MenuPlan = z.infer<typeof menuPlanSchema>;

export const menuRecommendOutputSchema = z.object({
  plans: z.array(menuPlanSchema).min(1).max(5),
});

export type MenuRecommendOutput = z.infer<typeof menuRecommendOutputSchema>;

// ============================================================
// 菜谱生成（用于 AI 推荐了不在菜品库里的菜）
// ============================================================
export const recipeGenerateInputSchema = z.object({
  dishName: z.string(),
  servings: z.number().default(2),
  availableSeasonings: z.array(z.string()),
  noSpicy: z.boolean().optional(),
  lowOilSalt: z.boolean().optional(),
});

export type RecipeGenerateInput = z.infer<typeof recipeGenerateInputSchema>;

// DeepSeek 经常把"适量/少许/半勺"等非数字塞进数字字段（尤其调料 quantity），
// 这里宽松解析：是数字直接用；是字符串就抽取其中的数值，抽不到则用兜底值。
const flexNum = (fallback = 0) =>
  z.preprocess((v) => {
    if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
    if (typeof v === "string") {
      const n = parseFloat(v.replace(/[^\d.\-]/g, ""));
      return Number.isFinite(n) ? n : fallback;
    }
    return fallback;
  }, z.number());

const stepTypeSchema = z
  .enum([
    "PREP",
    "MARINATE",
    "SOAK",
    "BLANCH",
    "BOIL",
    "STEAM",
    "STIR_FRY",
    "DEEP_FRY",
    "BRAISE",
    "REDUCE",
    "PLATE",
    "CLEAN",
  ])
  // AI 偶尔返回枚举外的值（如中文"翻炒"），兜底成 PREP 不让整条校验失败
  .catch("PREP");

export const recipeGenerateOutputSchema = z.object({
  cuisine: z.string(),
  totalMinutes: flexNum(20),
  difficulty: flexNum(2).pipe(z.number()).transform((n) => Math.min(5, Math.max(1, Math.round(n)))),
  isSpicy: z.boolean(),
  isVegetarian: z.boolean(),
  isSoup: z.boolean(),
  requiredCookware: z.array(z.string()),
  mainIngredients: z.array(z.string()),
  ingredients: z.array(
    z.object({
      name: z.string(),
      quantity: flexNum(),
      unit: z.string(),
      optional: z.boolean().optional(),
    })
  ),
  seasonings: z.array(
    z.object({
      name: z.string(),
      quantity: flexNum(),
      unit: z.string(),
    })
  ),
  steps: z.array(
    z.object({
      order: flexNum(),
      action: z.string(),
      durationMinutes: flexNum(),
      stepType: stepTypeSchema,
      heat: z.string().optional(),
      cookware: z.string().optional(),
      parallel: z.boolean().optional(),
      dependsOn: z.array(z.number()).optional(),
    })
  ),
  tips: z.array(z.string()).default([]),
  heatNotes: z.string().optional(),
});

export type RecipeGenerateOutput = z.infer<typeof recipeGenerateOutputSchema>;

// ============================================================
// 灵感解析
// ============================================================
export const wishParseOutputSchema = z.object({
  dishName: z.string(),
  cuisine: z.string().optional(),
  mainIngredients: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export type WishParseOutput = z.infer<typeof wishParseOutputSchema>;

// ============================================================
// 灵感 → 完整菜品（用户给一句话 + 可选手写做法，AI 补出和 RecipeGenerateOutput 同构的菜谱）
// ============================================================
export const wishToDishInputSchema = z.object({
  rawWish: z.string(),
  manualRecipe: z.string().optional().nullable(),
  servings: z.number().default(2),
  availableSeasonings: z.array(z.string()).default([]),
  noSpicy: z.boolean().optional(),
  lowOilSalt: z.boolean().optional(),
});
export type WishToDishInput = z.infer<typeof wishToDishInputSchema>;

// 输出复用 RecipeGenerateOutput 的结构 + 必带规范化菜名
export const wishToDishOutputSchema = recipeGenerateOutputSchema.extend({
  dishName: z.string(),
});
export type WishToDishOutput = z.infer<typeof wishToDishOutputSchema>;

// ============================================================
// Provider 接口
// ============================================================
export interface AIProvider {
  recommendMenu(input: MenuRecommendInput): Promise<MenuRecommendOutput>;
  generateRecipe(input: RecipeGenerateInput): Promise<RecipeGenerateOutput>;
  parseWish(rawText: string): Promise<WishParseOutput>;
  wishToDish(input: WishToDishInput): Promise<WishToDishOutput>;
}
