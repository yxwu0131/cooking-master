/**
 * 把 AI 调用抛出的原始 Error 映射成中文友好提示，避免把上游报文/配置细节直接弹给用户。
 * 各业务路径（菜单推荐 / 灵感入库 / 按需补菜谱）共用，fallback 传各自的兜底文案。
 */
export function mapAIErrorToChinese(
  e: unknown,
  fallback = "AI 调用失败，请稍后重试"
): string {
  if (!(e instanceof Error)) return fallback;
  const msg = e.message ?? "";
  const name = e.name ?? "";
  if (name === "AbortError" || /aborted|timeout/i.test(msg)) {
    return "AI 响应超时，请稍后再试（可能模型在思考较复杂的内容）";
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
  return fallback;
}
