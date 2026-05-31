import type { CapacitorConfig } from "@capacitor/cli";

// 厨神 安卓壳：纯 WebView 包裹线上站点。
// 内容全部走 https://cook.dorianweb.com，App 自身不打包页面 —— 线上一更新，App 内即生效（零成本）。
// www/ 只是 Capacitor 要求的占位 + 离线/加载兜底页。
const config: CapacitorConfig = {
  appId: "com.dorianweb.cooking",
  appName: "厨神",
  webDir: "www",
  server: {
    // 指向生产域名；Cloudflare 已托管 HTTPS。
    url: "https://cook.dorianweb.com",
    // 仅允许明文用于本地联调时临时改成局域网 IP，生产为 https，保持 false。
    cleartext: false,
  },
  android: {
    // 允许在 WebView 里混合内容时按需放开；默认不放开更安全。
    allowMixedContent: false,
  },
};

export default config;
