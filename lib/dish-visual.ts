// 菜品视觉降级：无成品图时按菜系/属性给一个 emoji 占位。
// 抽成共享模块，供 DishImage 组件与各列表卡片复用。

const CUISINE_EMOJI: Record<string, string> = {
  家常菜: "🍳",
  川菜: "🌶️",
  粤菜: "🦐",
  湘菜: "🔥",
  西餐: "🍝",
  江浙菜: "🦀",
  北方菜: "🥟",
  主食: "🍚",
};

export function dishEmoji(
  cuisine: string | null | undefined,
  isSoup?: boolean,
  isVegetarian?: boolean
): string {
  if (isSoup) return "🍲";
  if (cuisine && CUISINE_EMOJI[cuisine]) return CUISINE_EMOJI[cuisine];
  if (isVegetarian) return "🥬";
  return "🍽️";
}
