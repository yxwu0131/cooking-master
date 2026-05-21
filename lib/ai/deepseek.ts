import {
  type AIProvider,
  type MenuRecommendInput,
  type MenuRecommendOutput,
  menuRecommendOutputSchema,
  type RecipeGenerateInput,
  type RecipeGenerateOutput,
  recipeGenerateOutputSchema,
  type WishParseOutput,
  wishParseOutputSchema,
  type WishToDishInput,
  type WishToDishOutput,
  wishToDishOutputSchema,
} from "./types";
import {
  SYSTEM_PROMPT,
  menuRecommendPrompt,
  recipeGeneratePrompt,
  wishParsePrompt,
  wishToDishPrompt,
} from "./prompts";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

interface CompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

/**
 * DeepSeek API 客户端（OpenAI 兼容）
 */
async function callDeepSeek(
  messages: ChatMessage[],
  options: CompletionOptions = {}
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const apiBase = process.env.DEEPSEEK_API_BASE ?? "https://api.deepseek.com/v1";
  const model = options.model ?? process.env.DEEPSEEK_MODEL ?? "deepseek-v4-pro";

  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY 未配置");
  }

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 4000,
  };
  if (options.jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180000);

  try {
    const res = await fetch(`${apiBase}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`DeepSeek API 错误 ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("DeepSeek 返回空内容");
    }
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 提取可能被 markdown 围栏包裹的 JSON
 */
function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) return fenced[1].trim();
  return raw.trim();
}

export class DeepSeekProvider implements AIProvider {
  async recommendMenu(input: MenuRecommendInput): Promise<MenuRecommendOutput> {
    const raw = await callDeepSeek(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: menuRecommendPrompt(input) },
      ],
      { temperature: 0.8, jsonMode: true, maxTokens: 6000 }
    );
    const parsed = JSON.parse(extractJson(raw));
    const result = menuRecommendOutputSchema.safeParse(parsed);
    if (!result.success) {
      console.error("[ai.recommendMenu] schema 校验失败:", result.error.issues);
      console.error("[ai.recommendMenu] raw:", raw.slice(0, 500));
      throw new Error("AI 返回的菜单格式不正确");
    }
    return result.data;
  }

  async generateRecipe(input: RecipeGenerateInput): Promise<RecipeGenerateOutput> {
    const raw = await callDeepSeek(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: recipeGeneratePrompt(input) },
      ],
      { temperature: 0.6, jsonMode: true, maxTokens: 3000 }
    );
    const parsed = JSON.parse(extractJson(raw));
    const result = recipeGenerateOutputSchema.safeParse(parsed);
    if (!result.success) {
      console.error("[ai.generateRecipe] schema 校验失败:", result.error.issues);
      throw new Error("AI 返回的菜谱格式不正确");
    }
    return result.data;
  }

  async parseWish(rawText: string): Promise<WishParseOutput> {
    const raw = await callDeepSeek(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: wishParsePrompt(rawText) },
      ],
      { temperature: 0.3, jsonMode: true, maxTokens: 500 }
    );
    const parsed = JSON.parse(extractJson(raw));
    const result = wishParseOutputSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error("AI 返回的灵感解析格式不正确");
    }
    return result.data;
  }

  async wishToDish(input: WishToDishInput): Promise<WishToDishOutput> {
    const raw = await callDeepSeek(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: wishToDishPrompt(input) },
      ],
      { temperature: 0.5, jsonMode: true, maxTokens: 3500 }
    );
    const parsed = JSON.parse(extractJson(raw));
    const result = wishToDishOutputSchema.safeParse(parsed);
    if (!result.success) {
      console.error("[ai.wishToDish] schema 校验失败:", result.error.issues);
      console.error("[ai.wishToDish] raw:", raw.slice(0, 500));
      throw new Error("AI 返回的菜品格式不正确");
    }
    return result.data;
  }
}
