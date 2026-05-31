"use client";

import * as React from "react";
import Image from "next/image";
import { dishEmoji } from "@/lib/dish-visual";
import { cn } from "@/lib/utils";

type DishImageProps = {
  imageUrl?: string | null;
  name: string;
  cuisine?: string | null;
  isSoup?: boolean;
  isVegetarian?: boolean;
  /** 外层容器样式：尺寸/圆角/emoji 字号都从这里给（如 "size-12 rounded-xl text-2xl"） */
  className?: string;
  /** next/image 的 sizes 提示，默认按移动优先 */
  sizes?: string;
};

/**
 * 菜品成品图：有 imageUrl 就显示真图（object-cover 填满），
 * 没有 / 加载失败则降级成菜系 emoji 色块。容器尺寸与圆角由 className 决定。
 */
export function DishImage({
  imageUrl,
  name,
  cuisine,
  isSoup,
  isVegetarian,
  className,
  sizes = "(max-width: 768px) 40vw, 200px",
}: DishImageProps) {
  const [errored, setErrored] = React.useState(false);
  const showImage = imageUrl && !errored;

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden bg-accent flex items-center justify-center leading-none",
        className
      )}
    >
      {showImage ? (
        <Image
          src={imageUrl}
          alt={name}
          fill
          sizes={sizes}
          className="object-cover"
          onError={() => setErrored(true)}
        />
      ) : (
        <span aria-hidden>{dishEmoji(cuisine, isSoup, isVegetarian)}</span>
      )}
    </div>
  );
}
