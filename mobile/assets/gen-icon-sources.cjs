// 生成 @capacitor/assets 的源 PNG：logo.png（完整图标）+ icon-foreground.png（自适应前景）。
// 品牌 = app-nav 的 logo 徽章：白色 lucide ChefHat 描边 + 番茄橙圆角方
//   （--primary oklch(0.65 0.18 42) ≈ #E56022，渐变 #F2864A→#D9531F）。
// 用主项目的 sharp 光栅化 SVG（mobile 子项目自身没装 sharp）。
//
// 重新生成图标/启动图的完整流程：
//   1) node mobile/assets/gen-icon-sources.cjs        # 重出两个源 PNG
//   2) cd mobile && npx @capacitor/assets generate --android \
//        --iconBackgroundColor '#E56022' --iconBackgroundColorDark '#E56022' \
//        --splashBackgroundColor '#FCF9F2' --splashBackgroundColorDark '#241D18'
//   3) 把两个 mipmap-anydpi-v26/ic_launcher*.xml 的 <background> 去掉 16.7% inset
//      （工具默认给纯色背景套 inset → 圆形遮罩下四角透明，见 NOTES 坑34），改成：
//        <background android:drawable="@mipmap/ic_launcher_background" />
//   4) 重新 assembleDebug（见 README）。
const sharp = require("../../node_modules/.pnpm/sharp@0.34.5/node_modules/sharp");
const fs = require("fs");
const path = require("path");

const OUT = __dirname;

// lucide ChefHat（24 网格，描边风格，居中于 12,12）
const HAT = `
  <path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z"/>
  <line x1="6" x2="18" y1="17" y2="17"/>`;

// 完整图标：番茄橙渐变圆角方 + 居中白帽（scale 40 → 描边 64px）
const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1024" y2="1024" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#F2864A"/>
      <stop offset="1" stop-color="#D9531F"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="1024" height="1024" rx="230" fill="url(#g)"/>
  <g fill="none" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"
     transform="translate(512 512) scale(40) translate(-12 -12)">${HAT}</g>
</svg>`;

// 自适应前景：仅白帽、透明底，scale 40 与 logo 一致；安全边由 adaptive-icon 的 16.7% inset 提供。
const fgSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <g fill="none" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"
     transform="translate(512 512) scale(40) translate(-12 -12)">${HAT}</g>
</svg>`;

(async () => {
  await sharp(Buffer.from(logoSvg)).png().toFile(path.join(OUT, "logo.png"));
  await sharp(Buffer.from(fgSvg)).png().toFile(path.join(OUT, "icon-foreground.png"));
  console.log("wrote logo.png + icon-foreground.png to", OUT);
})();
