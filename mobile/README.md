# 厨神 · 安卓壳（Capacitor WebView）

纯 WebView 壳，**内容全部走线上** `https://cook.dorianweb.com`（Cloudflare 托管 HTTPS）。
App 自身不打包任何页面 —— 线上一更新，App 内即生效，**升级零成本**。
日后要加原生能力（推送 / 相机 / 分享）再装对应 Capacitor 插件即可。

- `appId`：`com.dorianweb.cooking`
- `appName`：厨神
- 指向站点：`capacitor.config.ts` 的 `server.url`
- `www/index.html`：仅作加载/离线兜底页（指向线上时几乎不会被看到）

> `android/` 目录是 **完全由 `capacitor.config.ts` 生成**、已 gitignore（无任何手改）。
> 一次性产物，按下面步骤随时可重建；不进版本库，保持仓库干净。

## 一次性环境准备（本机已就绪，换机时照做）

构建 Capacitor 7 的安卓工程需要：

| 工具 | 版本 | 本机位置 |
|---|---|---|
| Node | ≥ 20（本机 v24） | PATH |
| **JDK 21**（Capacitor 7 强制，**17 会报「无效的源发行版：21」**） | Temurin 21 | `C:\Java\jdk-21.0.11+10` |
| Android SDK（platform-tools / platforms;android-35 / build-tools;35.0.0） | cmdline-tools 安装 | `%LOCALAPPDATA%\Android\Sdk` |

装 Android SDK（无需 Android Studio、无需管理员）：

```powershell
# 1. 下载 cmdline-tools（最新版号见 https://developer.android.com/studio#command-line-tools-only）
#    解压到 %LOCALAPPDATA%\Android\Sdk\cmdline-tools\latest\
# 2. 接受许可 + 装包（用 Start-Process 重定向 stdin 喂 y，见 NOTES 坑29）
$env:JAVA_HOME="C:\Java\jdk-21.0.11+10"; $env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
& "$env:ANDROID_HOME\cmdline-tools\latest\bin\sdkmanager.bat" "platform-tools" "platforms;android-35" "build-tools;35.0.0"
```

## 重新生成 + 构建 APK

```powershell
cd "E:\claude code\cooking master\mobile"
npm install                       # 装 @capacitor/{core,cli,android}
npx cap add android               # 若 android/ 不存在则生成（已存在用 npx cap sync android）

# 关键：必须用 JDK 21
$env:JAVA_HOME="C:\Java\jdk-21.0.11+10"
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
$env:PATH="$env:JAVA_HOME\bin;$env:PATH"

# local.properties 指向 SDK（android/ 重新生成后需重写一次）
"sdk.dir=C\:\\Users\\Administrator\\AppData\\Local\\Android\\Sdk" | Set-Content android\local.properties -Encoding ascii

cd android
.\gradlew.bat assembleDebug --no-daemon     # 产出 app\build\outputs\apk\debug\app-debug.apk
```

产物：`mobile/android/app/build/outputs/apk/debug/app-debug.apk`（约 4 MB）。
debug 包用 debug keystore 自签，可直接侧载到家人手机（需开「允许未知来源安装」）。

## App 图标 + 启动图（已完成 2026-05-30）

品牌图标 = app-nav 的 logo 徽章：**白色 lucide ChefHat 描边 + 番茄橙圆角方**（`#E56022`）。

- **源文件**（入库，在 `mobile/assets/`）：`logo.png`（1024² 完整图标）、`icon-foreground.png`（1024² 透明底白帽，自适应前景）、`gen-icon-sources.cjs`（从内联 SVG 用主项目 sharp 生成上面两个 PNG）。
- **生成各密度图标/启动图**（`mobile/android/` 是 gitignore 的生成物，重建后需重跑）：
  ```powershell
  node mobile/assets/gen-icon-sources.cjs   # 重出源 PNG（可选，已入库）
  cd mobile
  npx @capacitor/assets generate --android `
    --iconBackgroundColor '#E56022' --iconBackgroundColorDark '#E56022' `
    --splashBackgroundColor '#FCF9F2' --splashBackgroundColorDark '#241D18'
  ```
- **关键手动修正**（每次重跑 `@capacitor/assets generate` 后都要做，见 NOTES 坑34）：把
  `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml` 和 `ic_launcher_round.xml` 里
  `<background>` 的 `<inset … 16.7%>` 去掉，改成纯色全幅：
  ```xml
  <background android:drawable="@mipmap/ic_launcher_background" />
  ```
  否则圆形遮罩下图标四角会透明。前景的 16.7% inset 保留。
- 改完重新 `assembleDebug` 即生效。**未在真机实测新图标**（无设备）——需家人装一次确认桌面图标/启动图正常。

## 待办

- **release 签名包**：要长期分发给家人，建一个 release keystore，`assembleRelease` + 签名（debug 包 Android 会提示来源不明，但能装能用）。
- 可选原生增强：状态栏颜色（`@capacitor/status-bar`）、返回键退出确认、消息推送。
