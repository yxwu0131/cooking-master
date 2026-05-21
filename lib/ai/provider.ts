import type { AIProvider } from "./types";
import { DeepSeekProvider } from "./deepseek";

let provider: AIProvider | null = null;

/**
 * 获取 AI Provider 单例。
 * 未来想切换到通义/豆包/Claude，只需要改这里。
 */
export function getAIProvider(): AIProvider {
  if (provider) return provider;
  provider = new DeepSeekProvider();
  return provider;
}

export type { AIProvider } from "./types";
export * from "./types";
