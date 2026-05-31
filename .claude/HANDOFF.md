# 项目交接摘要

> **2026-05-31 状态（推 main 前深度评测 + 5 项硬化修复，全本地未提交）**：生产仍 `ea67fc9`。推 main 前做了一轮多 agent 深度评测（8 维度并行审查 + 对抗式复核，详见 NOTES 决策35 / 会话报告），并落地 5 类修复，**tsc 全过**：
> 1. **下线实时 Bing 抓图入口**（评测唯一推送前阻塞项）：删 `dishes/page.tsx` 配图链接；`getDishImageCandidatesAction` 加 `ENABLE_DISH_IMAGE_FETCH` 开关（默认关）。保留上传照片路径。
> 2. **堵开放注册**：`registerAction` 的自助建家庭加 `ALLOW_OPEN_REGISTRATION` 开关（默认关）——此前任何网友可注册成 ADMIN（prod 现存，非本次引入）。邀请码加入不受影响。
> 3. **AI 默认模型** `deepseek-v4-pro`→`deepseek-chat`（deepseek.ts + .env.example）。
> 4. **seed 删 6 道重复菜**（决策33 的源头止血，不再被 seed 复活）。
> 5. **5 小修**：AI 菜单补 servings 按人数 / menuPlan flexNum / finishCooking 状态机校验 / 抽 `lib/ai/error-message.ts` 统一 AI 错误中文映射。（updateDishRecipe 一度限 ADMIN，后按用户意见撤销——家庭成员均可编辑做法，因自助注册已关闭。）
> - **新增两个安全开关**（默认关，公网保持关）：`ALLOW_OPEN_REGISTRATION`、`ENABLE_DISH_IMAGE_FETCH`，已写进 `.env.example`。
> - **上 prod 必做**：① 决策33 的 6 道重复菜 seed 已删但 **prod 存量仍在**，部署后跑一次 `deleteMany`（有引用先 reassign）才清干净；② 骨架菜 recipe 不从 dev 搬；③ 部署后这两个开关不要在 prod 设 1。
> - **第二批硬化已补**（同日，tsc+build 全过）：AI 调用轻量重试、采购调料别名归一、补 2 索引(MealSession/Feedback)、补谱 P2002 友好兜底、主食兜底退到任意 isStaple、flexNum 区间陷阱修复、emoji a11y label、finishCooking 批量 $transaction。
> - **仍刻意未做（需 schema 迁移设计）**：`Dish.canonicalKey` 去重字段、`MenuDish.dishId` 改可空+SetNull；及蒸锅占灶/混单位等 nit。
>
> ---
>
> **2026-05-31 状态（菜品图盲评 → 判废删库）**：生产仍 `ea67fc9`。对自动抓的 311 张菜品图做了 30 张盲评（Read 工具逐张渲染核对菜名）：**命中率仅 2/30 ≈ 6.7%，且含 1 张 NSFW（"清炒虾仁"→沙滩裸女）**，远低于 >85% 门槛。判定 Bing 自动抓图对中文菜名**根本不可用**（垃圾 + 水印 + 抓到生食材/同名实体 + NSFW 泄漏）。用户拍板：**已 `rm -rf data/images/dish`（88MB）+ `_cand` 缓存**（本地操作，`data/` gitignore、不在 prod，零仓库/生产影响）。**图片基础设施全保留**（抓图脚本/`/api/img` 路由/`/dishes/images` 选图后台/`DishImage` 组件 + emoji 降级）。将来上图只走人工/实拍/食谱 API。详见 NOTES 坑33 补（2026-05-31）+ memory `reference_bing_food_images_low_quality`。此项不影响代码、不进将来的 commit。
>
> ---
>
> **2026-05-30 状态（App 图标 + 启动图做好，全本地未提交）**：生产仍 `ea67fc9`。在下面 05-29 那批基础上又加了**安卓 App 图标 + 启动图**（HANDOFF 任务10，NOTES 决策34/坑34），仍**全部未 commit、未推**（用户要求攒着一起推；推 main 需明确授权）：
> - **图标 = 品牌 logo 复刻**：白色 lucide ChefHat 描边 + 番茄橙圆角方（`#E56022`，= app-nav 徽章），不另造设计。启动图同款 logo 居中，浅色奶油底 `#FCF9F2` / 深色 `#241D18`。
> - **管线**：`mobile/assets/gen-icon-sources.cjs`（主项目 sharp 把内联 SVG 栅格化成 `logo.png` + `icon-foreground.png` 两个源 PNG，**入库**）→ `npx @capacitor/assets generate --android`（出 92 个密度产物到 gitignore 的 `mobile/android/`）→ **手动修正**两个 `ic_launcher*.xml` 的 `<background>` 去掉 16.7% inset（坑34：否则圆形遮罩下四角透明）→ `assembleDebug`。
> - **验证**：Read 工具直接看生成 PNG（CDP screenshot 本环境失效，Read 渲染图片可用），legacy 图标/圆形遮罩模拟/浅深启动图四类均 OK。`assembleDebug` 28s 成功，新 APK **4.7MB**（`mobile/android/app/build/outputs/apk/debug/app-debug.apk` + 复制到 `mobile/厨神-debug.apk`）。**未真机实测图标**（无设备，需家人装一次确认桌面图标/启动图）。
> - 新增入库文件：`mobile/assets/{logo.png, icon-foreground.png, gen-icon-sources.cjs}`、`mobile/README.md`（图标章节）、`NOTES.md`（决策34/坑34）、本 HANDOFF。`mobile/android/` 与 `*.apk` 仍 gitignore。
> - **dev 库 bulk-fill 未跑完**：`data/bulk-fill-progress.log` 停在 195/242（上次会话结束时中断）。**不阻塞上线**——按计划 prod 自己跑 bulk-fill / ensure-recipes 按需触发，dev 库完整度无所谓；要补可重跑脚本（幂等，只扫 `recipe:null`）。
>
> ---
>
> **2026-05-29 状态（图片回退 emoji + 列表页美化 + 骨架菜按需 AI 补谱 + 去重，全本地未提交）**：生产仍 `ea67fc9`。本会话在 05-28 那批基础上又做了一大批，**全部未 commit、未推**（用户要求攒着一起推；推 main 需明确授权）：
> 1. **图片功能整体回退到 emoji**（用户体感「Bing 抓的图有点可怕」）：① `UPDATE Dish SET imageUrl=NULL`（all 312→0），`DishImage` 组件已有 `dishEmoji(cuisine, isSoup, isVegetarian)` 降级路径，自动回到原决策23 的暖色 emoji 卡通头像；② 物理图片 `data/images/dish/*`（311 张）**保留**，抓图脚本/路由/选图后台页/`DishImage` 组件**全部留着不删**，下次想重启用只需重新抓+`--relink`。NOTES 记入坑33 + memory 写跨项目参考 `reference_bing_food_images_low_quality.md`（自动抓食物图<85%命中不如 emoji）。
> 2. **列表页细节美化**（HANDOFF 任务8）：反馈 / 食材库存 / 家庭档案 三页全部加暖色 stats tile + 暖色渐变空状态，沿用 dashboard 的 StatCard pattern——
>    - 反馈页：4 块 tile（反馈/平均分/5星/最爱）+ 左缘按星级染色 + 暖色空状态。新增 `prisma.feedback.count` 取全量数。
>    - 库存页：4 块 tile（品类/即将过期/冷藏/冷冻；过期=0 时灰色）+ 暖色空状态。
>    - 家庭页：顶部加暖色 hero 卡（Users 图标 +「X口之家」副标）。
>    - **Dashboard 加「最近做了什么」区块**：最近 3 个 `DONE` session，每张卡 餐次emoji+日期/最多 4 道菜 soft Badge/平均星，hover 抬升+跳 `/cook/[id]`。
> 3. **骨架菜按需 AI 补菜谱 + 一次性兜底**（NOTES 决策32）：
>    - **详情页空状态**（`dish-recipe-view.tsx`）：暖色渐变卡 + Sparkles 主按钮「让 AI 生成做法」+ outline「手动添加」。新增 server action `generateDishRecipeAction(dishId)` 复用 `ensure-recipes.ts` 同款 AI 调用路径。
>    - **批量兜底脚本** `scripts/bulk-fill-recipes.ts`：扫描 `recipe: null` 全部菜，逐道 `generateRecipe` 写回。失败跳过不阻塞、输出到 `data/bulk-fill-progress.log` 看板（`[N/total] 菜名 ... ok 9.3s`）。**正在跑：140/242 ok=140 fail=0，ETA ~15 分钟后全完**（保留 99 道；本批 6 道重复菜已删，会在脚本剩余队列中 FAIL，正常）。完成后 `ensure-recipes` 几乎不再触发，省 AI 费。
> 4. **菜品重复清理**（NOTES 决策33）：按「换部位/换主食=同一道菜」原则，dev 库删 6 道重复菜：可乐鸡腿 / 蚝油生菜心 / 口水鸡丝 / 麻婆豆腐盖饭 / 宫保鸡丁盖饭 / 黄焖鸡米饭（保留可乐鸡翅/蚝油生菜/口水鸡/麻婆豆腐/宫保鸡丁/黄焖鸡）。**306 道剩余**，0 FK 引用（不是 prod 数据，是 dev 库状态）。**上 prod 时要在 prod 库重跑同样 deleteMany 或在 seed.ts 注释掉这 6 道**（决策22 扩库时埋的雷）。
> 5. **CDP 实测验证**：用 CDP Chrome（端口 9222）+ agent-browser pdf 验证三页+菜品库+骨架菜详情页全部渲染正常（screenshot 命令有 os error 10060，但 pdf 可用→Read PDF 视觉确认）。tsc 全程过。
>
> **生产数据不受影响**：图片清空/删菜都是 dev 库状态，prod 库还是 ea67fc9 时的样子（本来就没接图 + 多 6 道重复菜）。
> **本地预览**：Docker 起 `cooking-master-db`(55432) → `node node_modules/next/dist/bin/next dev`（别用 `pnpm dev`，会卡预检）。CDP Chrome 复用登录态用 `node ~/.claude/skills/browser-cdp/scripts/setup-cdp-chrome.js 9222`，然后 `agent-browser --cdp 9222 open <url> && agent-browser --cdp 9222 pdf <path>`；screenshot 命令在本环境失效，PDF 替代（Read 工具直接读）。
> **批量补菜谱命令**（绕 pnpm 预检）：`node --env-file=.env node_modules/.pnpm/tsx@4.22.1/node_modules/tsx/dist/cli.mjs scripts/bulk-fill-recipes.ts`，看板 `Get-Content data\bulk-fill-progress.log -Wait -Tail 10`。
>
> ---
>
> **2026-05-28 状态（UI 美化 + 菜品图功能，全本地未提交）**：生产仍 `ea67fc9`。本会话在上批基础上又做了一大批，**全部未 commit、未推**（用户要求攒着一起推；推 main 需明确授权）：
> 1. **修了家人反馈的核心 bug**：手机端「顶部标签顶到屏幕顶」——真因是底部导航 `<nav fixed bottom-0>` 嵌在带 `backdrop-blur` 的 `<header>` 里被劫持定位（坑31）。已移出 header → 钉回底部。+ viewport `viewport-fit=cover` + 顶栏 `safe-area-inset-top`（Android15 edge-to-edge 避让）。改 `components/app-nav.tsx`、`app/layout.tsx`。双视口验证、桌面零破坏。
> 2. **菜品成品图功能（从零搭）**：本地卷存图（`IMAGES_DIR`，prod compose 早备好卷+env）+ 服务路由 `app/api/img/[...path]/route.ts` + `components/dish-image.tsx`(图/emoji 降级) + 批量抓图脚本 `scripts/fetch-dish-images.ts`(Bing) + 公共库 `lib/dish-image-fetch.ts`。**文件名按菜名 sha1**（跨库稳定，便于上 prod，见坑32）。已接入：菜品库列表缩略图、菜品详情大图 banner、做饭确认页菜品卡片网格、菜单编辑/点菜选择器缩略图。**→ 2026-05-29 整体回退到 emoji，详见顶部 05-29 状态块。代码留着不删。**
> 3. **选图/上传后台页 `/dishes/images`**（`components/dishes/dish-image-manager.tsx` + `lib/actions/dish-images.ts`）：每道菜「换图」(搜 Bing 候选→点选)/「上传」自家照片/「清除」。已验证闭环。**因为自动抓图命中率仅约六成**（歧义菜名/防盗链会抓到水印/无关图），靠这个页人工纠偏。
> 4. **数据现状**：本地 dev 库已给~310 道菜抓了图（质量参差，正用改进查询后台重跑一遍 baseline）。tsc 全程过。
>
> **上 prod 必做**（见 NOTES 决策31/坑32）：① 推代码；② 拷本地 `data/images/dish/*` → NAS 同路径（卷已挂）；③ 对 prod 库跑 `scripts/fetch-dish-images.ts --relink`（按菜名 sha1 重连 imageUrl，不重抓）。**→ 因 05-29 回退，这三步暂搁，等以后图片质量门槛达标再启用。**
>
> ---
>
> **2026-05-27 状态（线上稳定 + 安卓 APK 已跑通，本地有未提交改动）**：生产 https://cook.dorianweb.com 仍是 `ea67fc9`（含两阶段时间线 + 扩库 + 自动备份），稳定运行。本会话新增**两类本地改动，均未 commit、未推**：
> 1. **两个非阻断 UI 小修**（`components/cook/session-workspace.tsx`）：采购清单 + 推荐「需买」里 quantity=0 的调料从「盐 0」改成「盐 适量」。tsc 已过。（「三阶段」文案观察 = 早已清除，无需改。）
> 2. **安卓 APK（Capacitor WebView 壳）跑通**：新增隔离子目录 `mobile/`（自带 npm 依赖，不碰主 app pnpm 树），`server.url` 指向线上站点 → 内容走线上、升级零成本。已构建出 **3.9MB debug APK**（`mobile/android/app/build/outputs/apk/debug/app-debug.apk`，另复制一份 `mobile/厨神-debug.apk`）。详见 NOTES 决策29/坑29/坑30、`mobile/README.md`。
>
> **重要约束复述**：用户选择「这批 UI 小修 + APK **先攒着，和后续 UI 美化一起推**」→ **暂不 commit、暂不推 main**（推 main 需用户明确授权，会触发 CI+NAS 重部署）。当前改动都在工作区（未 commit）：`session-workspace.tsx`、`.dockerignore`、`.gitignore`、`mobile/`(5 个真源文件)、本 HANDOFF、NOTES。
>
> **下一步**：① APK 真机实测（用户装一次，确认能开/能登录/WebView 正常 —— 无设备我测不了）；② **UI 美化 + App 图标/启动图 + 配图**（图标用 `npx @capacitor/assets generate --android` 从源图一键出，再重 build；长期分发再做 release 签名包）；③ 上面都 OK 后用户授权 → 一次性 commit + 推 main；④ 轮换暴露过的密钥（DeepSeek/Supabase）。

## 1. 当前目标
「厨神」家庭做饭规划系统：家庭档案 → 菜品库 → 点菜 → 厨师确认菜单 → 采购清单 → 做饭时间线 → 反馈。自家用，部署在极空间 NAS，域名 cook.dorianweb.com。当前阶段：已上线给家人用，正按家人实际使用反馈迭代。

## 2. 已完成工作（本会话 2026-05-24，待验证+待推送）
- **时间线重构（按用户偏好）**：原 **6 模块 → 2 阶段：① 备菜统一准备 ② 烹饪**，删掉"上菜准备/收尾"阶段。烹饪阶段按菜分块（先开不占手的饭/炖/蒸，叶菜汤压轴），每道菜可展开**完整菜谱详情**（食材/调料/分步做法/火候）。改：`components/cook/session-workspace.tsx`(重写 TimelineView + 新增 DishCookCard，删 6 模块/dishMetaByName)、`app/(app)/cook/[id]/page.tsx`(menu.dishes 加载 recipe)、`lib/planning/cooking-plan.ts`。
- **bug-漏菜**：`cooking-plan.ts` 把无菜谱的菜整道丢弃 → 加兜底合成步骤，保证一定出现。
- **bug-牛肉焖饭重复煮饭**：`menu.ts` 主食兜底正则只认"米饭" → 改查 `Dish.isStaple` + 扩正则（焖饭/炒饭/盖饭等）。
- **食材手动添加**：`lib/actions/inventory.ts:addCustomInventoryItemAction`（库里没有的当场建，自动猜分类/采购区）+ `components/inventory/inventory-client.tsx` 搜索无匹配时出现手动添加入口。
- **扩库**：`prisma/seed.ts` 食材 214→**304**、菜品 68→**306**（新增 238 道为 `DISH_SKELETONS` 骨架，只有元数据无菜谱；确认菜单时由 `lib/planning/ensure-recipes.ts` 的 AI 按需补全；seed 用独立 loop upsert，不写 recipe，已有菜谱原样保留）。

## 3. 当前项目结构
Next.js 16 + React 19 + Prisma 6.19 + Postgres16 + Auth.js v5 + Tailwind v4 + DeepSeek。
- `lib/planning/`：cooking-plan.ts(时间线)、prep-consolidation.ts(按食材合并备菜)、ensure-recipes.ts(AI 补菜谱)、shopping-list.ts。
- `lib/actions/`：menu.ts / meal-session.ts / dishes.ts / inventory.ts / invite.ts。
- `components/cook/session-workspace.tsx`：核心工作区（菜单流程 + 时间线两阶段 + 菜谱详情）。
- `components/inventory/inventory-client.tsx`：库存 UI。
- `prisma/schema.prisma` + `prisma/seed.ts`(304 食材 + 68 完整菜 + 238 骨架菜)。
- 部署：`docker-compose.prod.yml`(NAS)、`.github/workflows/docker-build.yml`。

## 4. 关键决策 / 约束
- **时间线用户明确要"备菜统一、不要做一道切一道"**：保留全部前置切配，我原想的"就近 JIT 备菜"作废。备菜=备菜、烹饪=烹饪、上菜准备删除。
- **环境**：Windows + pnpm 11。`pnpm db:seed` 会卡在 pnpm 预装检查 → 改 schema 跑 generate 前先停 dev server；跑 seed/CLI 用 `.pnpm` 直连路径（见下）。本地 DATABASE_URL 端口=**55432**（坑22）。DEEPSEEK_MODEL=deepseek-chat。
- **跑 seed 命令**（绕开 pnpm 预检）：`node --env-file=.env node_modules/.pnpm/tsx@4.22.1/node_modules/tsx/dist/cli.mjs prisma/seed.ts`
- **部署**：NAS 不本地 build，Actions 推 GHCR；国内拉用南大镜像 `ghcr.nju.edu.cn` pull+tag 回原名再 up -d。SSH `ssh -p 18888 18938898409@192.168.1.3`（docker 需 sudo，~90 字符折行用短变量）。**对 NAS 的远程操作需用户在会话里用 `!` 前缀跑（自动模式会拦生产 SSH）**。
- **数据安全**：seed 只 upsert 公共食材/菜品；绝不加 `--accept-data-loss`、绝不 `down -v`。
- git 提交**不要**加 "Co-Authored-By" 行；**推 main 需用户明确授权**。

## 5. 当前问题 / 待验证
- **本地一大批未 commit 改动**（攒到现在，推 main 需用户明确授权）：
  - 代码：`components/app-nav.tsx`、`app/layout.tsx`、`app/(app)/{dishes/[id],dishes,cook/[id],feedback,family,dashboard}/page.tsx`、`components/cook/session-workspace.tsx`、`components/dishes/dish-recipe-view.tsx`、`components/dishes/dishes-browse.tsx`、`components/inventory/inventory-client.tsx`、`lib/actions/dishes.ts`
  - 新文件：`components/dish-image.tsx`、`components/dishes/dish-image-manager.tsx`、`lib/actions/dish-images.ts`、`lib/dish-image-fetch.ts`、`lib/dish-visual.ts`、`scripts/fetch-dish-images.ts`、`scripts/bulk-fill-recipes.ts`、`app/(app)/dishes/images/`、`app/api/img/`、`mobile/`
  - 文档：`.claude/HANDOFF.md`、`NOTES.md`、`.dockerignore`、`.gitignore`
  - tsc 全程过。git 提交别加 Co-Authored-By。
- **dev 库状态偏离 seed**（上 prod 时要同步）：
  - `Dish.imageUrl` 全部 NULL（自然态，prod 库本来就没填，无需 sync）
  - 删了 6 道重复菜（决策33），prod 库要么手动同样 deleteMany，要么在 `seed.ts` 注释这 6 道再走 idempotent upsert
  - 242 道骨架菜的 `Recipe` 已由 AI 批量补（决策32），prod 库**不应该**搬本地 recipe（用户口味偏置不同），让 prod 也跑一次 `bulk-fill-recipes.ts` 兜底（或保持原 ensure-recipes 按需触发）
- **APK 待真机实测**：debug APK 是 WebView 壳指向 `cook.dorianweb.com`，构建通过但无设备实测；需用户装一次确认能开/登录/WebView 正常。
- **生产自动备份已生效（2026-05-26）**：含 backup 的 `docker-compose.prod.yml` 已同步到 NAS，`cooking-backup` 跑起来了（每天 3:00 pg_dump → `./data/backups`，保留 14 天；还原：`pg_restore -c -d <db> <dump>`）。

## 6. 下一步任务（按优先级）
1. ~~点测+推 main 上线 2026-05-24 那批~~ ✅ 已上线（`ea67fc9`）
2. ~~补生产自动备份~~ ✅ cooking-backup 在跑
3. ~~两个非阻断小观察~~ ✅ 「盐 0」已修；「三阶段」文案早已清除
4. ~~安卓 APK 跑通~~ ✅ Capacitor WebView 壳，3.9MB debug APK（待真机实测）
5. ~~修手机端顶栏/底栏错位~~ ✅（坑31，底栏移出 header + safe-area）
6. ~~菜品图功能~~ ✅ 搭好了→**05-29 整体回退到 emoji**（坑33）。代码留着。
7. ~~列表页细节美化~~ ✅（反馈/库存/家庭三页 stats tile + 暖色空状态 + dashboard「最近做了什么」）
8. ~~骨架菜按需+一次性 AI 补菜谱~~ ✅ 详情页按钮 + bulk-fill 脚本（决策32）
9. ~~菜品重复清理（dev）~~ ✅ 删 6 道（决策33）
10. ~~App 图标 / 启动图~~ ✅ 2026-05-30 完成（决策34/坑34）：品牌 ChefHat+番茄橙，`mobile/assets/` 源 PNG + 生成器入库，新 APK 4.7MB。**未真机实测图标**。长期分发再做 release 签名包（仍待办）。
11. **用户授权 → 一次性 commit + 推 main**：触发 CI+NAS 重部署。上 prod 时同步 dev 库的删 6 道菜（手动 deleteMany 或改 seed.ts）。骨架菜 recipe 让 prod 自己跑 `bulk-fill-recipes.ts` 或走原有 ensure-recipes 按需触发，**别从 dev 搬**。
12. 陪家人 onboarding；轮换 DeepSeek / Supabase 密钥。
13. ~~（未来）菜品图盲评~~ ✅ 2026-05-31 做了 30 张盲评：**命中率 6.7% + 1 张 NSFW**，自动抓图判定**根本不可用**（NOTES 坑33 补 / memory）。已删整个 `data/images/dish/`（88MB）+ `_cand` 缓存。**基础设施保留**（脚本/路由/选图后台/DishImage 组件）。将来想上图**只走人工挑选 / 实拍 / 垂直食谱 API**，别再碰 Bing 自动抓；任何方案上线前仍先 30 张盲评 >85%。

## 7. 新窗口启动提示词
```
继续推进「厨神」家庭做饭规划系统。项目目录：E:\claude code\cooking master\
先读 .claude/HANDOFF.md（顶部 2026-05-29 状态块 + 第5/6节）、NOTES.md（坑31-33、决策31-33）、memory/MEMORY.md。
现状：生产 cook.dorianweb.com 稳定在 ea67fc9。本地一大批未commit改动（用户要求攒着一起推，未授权推main）：
  ①手机端顶/底栏错位修复（坑31）
  ②菜品成品图功能搭了又回退到 emoji（家人反馈图可怕，坑33，代码留着）
  ③反馈/库存/家庭三页 stats tile + 暖色空状态 + dashboard「最近做了什么」（决策23 一套语言）
  ④骨架菜详情页加「让 AI 生成做法」按钮 + 一次性兜底脚本 bulk-fill-recipes.ts（决策32）
  ⑤dev 库删 6 道重复菜：可乐鸡腿/蚝油生菜心/口水鸡丝/麻婆豆腐盖饭/宫保鸡丁盖饭/黄焖鸡米饭（决策33）
  ⑥mobile/ Capacitor 壳 + 3.9MB debug APK
tsc 全程过；CDP PDF 验证桌面无破坏。
环境：Windows+pnpm11；本地DB Docker容器 cooking-master-db 端口55432(坑22)；DEEPSEEK_MODEL=deepseek-chat。
本地预览：Docker起db → `node node_modules/next/dist/bin/next dev`(别用pnpm dev会卡预检)；CDP Chrome 9222 用 agent-browser pdf（screenshot 在本环境有 os error 10060，pdf 可用→Read 工具直接读）。
批量补菜谱命令(绕pnpm预检)：node --env-file=.env node_modules/.pnpm/tsx@4.22.1/node_modules/tsx/dist/cli.mjs scripts/bulk-fill-recipes.ts；看板 Get-Content data\bulk-fill-progress.log -Wait -Tail 10。
git别加Co-Authored-By；推main要我明确授权；NAS远程操作我用!前缀跑(自动模式拦生产SSH)。
下一步：①App 图标+启动图（capacitor/assets）②我授权后 commit+推 main（要同步 prod 库删 6 道重复菜，骨架菜 recipe 不要搬，让 prod 自己跑 bulk-fill 或 ensure-recipes 按需触发）③轮换密钥 ④未来再上图前先抽样盲评 30 张。
```
