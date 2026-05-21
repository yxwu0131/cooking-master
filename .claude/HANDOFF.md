# 项目交接摘要

> **2026-05-22 🎉 已上线生产：https://cook.dorianweb.com**（极空间 NAS）。菜品库 68 道 + 214 食材已入生产库，UI 暖色主题。本地 dev 仍可用（Postgres 容器 cooking-master-db，端口靠 `docker stop+start` 修，见坑 11）。
>
> **生产部署架构（已落地）**：GitHub Actions（`.github/workflows/docker-build.yml`）推 main 自动构建 → `ghcr.io/yxwu0131/cooking-master:latest`（web，standalone runner）+ `:migrate`（builder，跑 `db push`+`tsx seed`）。NAS 上 `/data_s001/cooking-master/` 放 `docker-compose.prod.yml` + `.env`，`sudo docker compose -f docker-compose.prod.yml up -d` 拉镜像跑 db+migrate+web，web 暴露 **3001**（3000 被 child-growth 占用）。复用现有 **cloudflared** 隧道，Cloudflare 后台加 public hostname `cook.dorianweb.com → http://192.168.1.3:3001`，TLS 由 Cloudflare 托管（**没用 Caddy**）。
>
> **部署中踩的坑全记在 NOTES 坑 14-21 / 决策 22-26**：①.npmrc Windows 路径毒化镜像 ②pnpm 11 build 脚本拦截（用 `--ignore-scripts`+`pnpm rebuild`）③`pnpm exec` 触发 deps-check（直接调 `.bin`）④pnpm 布局下 prisma 生成产物要从 `.pnpm/@prisma+client@*/.../.prisma` 手动补进 standalone ⑤极空间 SSH 重度沙箱（HOME 只读/docker 需 sudo/无法配公钥）⑥终端 ~90 字符硬折行（命令保持短行+用变量）⑦国内拉 Docker Hub/ghcr 超时（用 `docker.1ms.run`/`ghcr.nju.edu.cn` 镜像源 retag 回原名）⑧Cloudflare URL 要带 `http://` 前缀。
>
> **本地 git 仓库已建并推 GitHub**：`https://github.com/yxwu0131/cooking-master`（public，main 分支）。本地 git 身份是占位 `dorian <dorian@dorianweb.com>`（仅本仓库）。
>
> **遗留 / 下一窗口可做**：
> - ⚠️ 安全：用户在排障 inspect 输出里暴露了 child-growth 的 Supabase `SERVICE_ROLE_KEY` + 一个 DeepSeek key（cook 也复用了同一个 DeepSeek key），**建议轮换**。
> - migrate 镜像 1.06GB 偏大（builder 全量），国内首拉慢（决策 26）——可做精简 migrator 阶段优化。
> - 生产验收流程还没完整走（注册→建家庭→点菜→AI 推荐→时间线→反馈）。
> - 功能积压：#14 厨师自定义菜单 / #20 厨师评价等级 / 库存购买日期 / 常用菜模板。
> - 更新生产：改代码推 main → Actions 重建镜像 → NAS `pull && up -d`（或 watchtower 自动）。


## 1. 当前目标

构建「厨神」—— 面向中国家庭的智能吃饭规划系统。完整闭环：**家庭档案 → 灵感/菜品库 → 家人点菜 → 厨师确认菜单 → 采购清单 → 做饭时间线 → 吃后反馈 → 下次推荐更准**。前期 Web，自家用，部署到极空间 ZAPro NAS，域名 `dorianweb.com`。

## 2. 已完成工作

**P0+P1 MVP** + **端到端验证** + **二次迭代** + **#10 邀请** + **#11 当日厨师** + **熟练度迁移 FamilyMember** + **Wish→Dish 手写+AI 入库** + **菜品做法可编辑** + **菜单流程重构** + **时间线 6 模块化** + **强制主食** + **库存批删** + **厨具/调料预设大扩充** + **食材 seed 扩到 120+**（截至 2026-05-21）：

- **菜单流程重构（2026-05-21）**：把"采用方案→立即确认+生时间线"拆成两步
  - `lib/actions/menu.ts`：原 `confirmMenuAction` → 拆为
    - `selectMenuPlanAction(menuId)`：DRAFT → EDITING，其他归档；不生成附属
    - `addDishToMenuAction(menuId, dishId)` / `removeMenuDishAction(menuDishId)`：编辑期增删菜
    - `finalizeMenuAction(menuId)`：EDITING → CONFIRMED + ensureRecipes + ShoppingList + CookingPlan
    - `confirmMenuAction` 保留为兼容入口（select + finalize 一步到位）
  - `session-workspace.tsx`：新增 `EditingMenuSection`（菜单卡片 + 搜索增菜 + 移除按钮 + 最终确认）；DraftPlansSection 按钮文案改"选这套，进入调整"

- **时间线 6 模块化（2026-05-21）**：按用户给定结构组织 UI
  - 模块一 启动等待型（淘米煮饭/泡发/腌制/烧水）
  - 模块二 集中备菜（PREP/BLANCH）
  - 模块三 提前完成冷菜（凉菜的处理步骤）
  - 模块四 启动蒸煮（STEAM/BRAISE/长 BOIL/汤）
  - 模块五 连续快炒（STIR_FRY/DEEP_FRY/REDUCE）
  - 模块六 收尾上桌（PLATE/默认占位提示）
  - 分类函数 `classifyStepToModule(step, dish)` 在 `session-workspace.tsx`；需要 dish meta 判断 isStaple/isSoup/isCold 等，所以页面查询新增 `allDishes` 传给 workspace 做 name→meta 映射
  - 每个模块卡片显示时间范围 `+min ~ +min`，内部按 startMinute 升序

- **强制主食（2026-05-21）**：
  - `prompts.ts` 加硬约束：午餐/晚餐必含主食（米饭/面条/馒头/饺子/粥/米粉/河粉）
  - `menu.ts:generateMenuPlansAction` 服务端兜底：AI 漏主食时自动 append「白米饭」到每套方案 dishes

- **库存批量删除（2026-05-21）**：
  - `lib/actions/inventory.ts` 新增 `deleteInventoryItemsAction(ids[])` + `clearAllInventoryAction()`
  - `inventory-client.tsx`：每项卡片加 checkbox、可点卡片切换选中；group 标题点击可全选/取消该组；右上角「清空全部」按钮（弹 dialog 二次确认）；选中后底部浮动操作栏「移除选中」

- **厨具/调料预设大扩充（2026-05-21）**：
  - `kitchen-section.tsx` 的三个建议列表大改：
    - `COMMON_SEASONINGS` ~70 项（含基础酱油醋/盐糖/油/鲜味/辣椒/香料/粉/酱料/西式/腌渍）
    - `COMMON_STAPLES` ~40 项（米/面/饺子皮等）
    - `COMMON_COOKWARE` ~35 项（常用/蒸煮/烤炸/西式/早餐机/破壁机等）

- **食材 seed 扩到 120+（2026-05-21）**：`prisma/seed.ts:INGREDIENTS` 末尾追加 70+ 项，覆盖蔬菜/肉/禽/水产/蛋奶/豆制品/主食/水果/干货/调料各大类
  - ⚠️ **seed 还没跑**！下窗口要 `node node_modules/.pnpm/tsx@4.22.1/node_modules/tsx/dist/cli.mjs prisma/seed.ts` 才能真正写库

- **菜品做法编辑（新）**：
  - `components/dishes/dish-recipe-view.tsx` 一个 client 组件同时管 view/edit 模式
  - `lib/actions/dishes.ts:updateDishRecipeAction` 用 transaction 同时更新 Dish + Recipe，步骤 order 自动重新发号
  - 详情页加「编辑做法」按钮：基础字段 / 食材 / 调料 / 步骤（增删改+上下移+stepType 下拉）/ 小贴士 / 火候

- **Wish → Dish（新）**：
  - schema：`Wish.manualRecipe?` 新字段
  - `lib/actions/dishes.ts:parseWishToDishAction` + `lib/ai/types.ts:wishToDish` + `lib/ai/prompts.ts:wishToDishPrompt`
  - 工作流：用户填灵感 + 可选手写做法 → 点「AI 入库」→ AI 沿用草稿补齐 → `dish.upsert(by name)` + `recipe.upsert(by dishId)` + `familyDish.upsert(WANT_TO_TRY)` + `wish.parsedDishId`
  - UI：灵感卡片增 AI 入库按钮 / 铅笔编辑草稿 / 含做法 Badge

- **做饭熟练度迁移（新）**：
  - schema：`KitchenProfile.skillLevel/maxComplexity` 删除；`FamilyMember.cookingSkill?/maxComplexity?` 新增
  - 一次性迁移脚本 `scripts/migrate-skill-and-wish.ts`（ADD → UPDATE FROM → DROP，幂等）
  - AI 输入加 top-level `chef: {name, skillLevel, maxComplexity}`
  - `lib/planning/cooking-plan.ts` 的 skillMultiplier 改读 chef 对应 FamilyMember
  - members-section UI 加「下厨能力」分组

- **#11 当日厨师**：
  - meal-session createSession 加 `chefId` + 校验家庭
  - menu.ts 五个写操作（generate/confirm/start/finish）+ cancelSession 全部加 `chefId === user.id` 校验
  - 新建 session UI：accounts > 1 时出现厨师下拉
  - SessionWorkspace 按 isChef 控权（disabled + 改文案）；header 显示「厨师：XX [我]」
  - 列表页 `/cook` 卡片显示掌勺人

- **#10 多账户邀请注册**：
  - `lib/actions/invite.ts`：create / list / revoke / validate（公开校验）
  - `lib/invite-helper.ts`：`consumeInviteCodeInTx`（非 server action，能拿 tx 参数）
  - `lib/actions/auth.ts` registerAction 用 discriminatedUnion 分 new/invite 两种路径；邀请注册：role=MEMBER、关联 invite.familyId、自动建 FamilyMember、消费邀请码
  - 家庭页加「账户」Tab：列已加入账户 + 邀请码 CRUD + 历史邀请码折叠列
  - `/register?invite=CODE` 自动校验并切换 UI（隐藏 familyName，显示「加入 XX」横幅）
  - useSearchParams 必须包 Suspense（Next 16 静态生成要求），拆出 `register-form.tsx`

**二次迭代**：

- 6 个 non-blocking bug 全修（A 时区 / B AI 错误中文 / C 采购清单 alias 合并 / D 闭包陷阱 / E 默认数量 / F middleware→proxy）
- 新建 `lib/format.ts` 强制 `Asia/Shanghai`
- **时间线算法 V2 重写**（`lib/planning/cooking-plan.ts`）：餐馆出餐法，以上桌时间为锚点反向倒推，三阶段（PREP 集中前段 → SLOW 启动 → FAST 冲刺，叶菜 -2min、汤 -3min、米饭 -8min、凉菜 -12min、红烧 -10min），灶位冲突扫描线 + 熟练度时长缓冲
- **采购清单 UI 分两栏**：「🛒 需购买」按区卡片 + 「✓ 冰箱/常备已有」折叠列
- **AI 推荐改覆盖式**：不要求每道菜满足所有人，整桌每人 1-2 道符合即可，reasoning 说清谁吃哪道
- **建 session 时选当餐成员**：UI 多选 chip + schema 加 `MealSession.attendingMemberIds`，AI 只读入勾选成员偏好
- DEPLOY.md 极空间部署清单写完
- next.config.ts 加 `allowedDevOrigins` 修复 Next 16 dev 跨域阻 hydration

## 3. 当前项目结构

工作目录：`E:\claude code\cooking master\`

```
├── app/(auth|app)/...
├── components/{ui,family,dishes,inventory,cook}/
├── lib/
│   ├── ai/{provider,deepseek,prompts,types}.ts
│   ├── actions/{auth,family,inventory,dishes,meal-session,menu,feedback,session}.ts
│   ├── planning/{shopping-list,cooking-plan,ensure-recipes}.ts
│   ├── format.ts          ← 时区统一工具
│   ├── auth-helper.ts / db.ts
├── prisma/{schema.prisma, seed.ts}
├── auth.ts / auth.config.ts / proxy.ts   ← 已从 middleware.ts 改名
├── docker-compose.yml / Dockerfile / Caddyfile
├── DEPLOY.md             ← 极空间部署清单
├── NOTES.md              ← 11 坑 + 13 决策 + 6 修过 bug
└── .env.production.example
```

## 4. 关键决策

- **DeepSeek 用 `deepseek-chat`**，不用 `deepseek-v4-pro`（reasoning model 太慢）
- **`DATABASE_URL` 必须 `127.0.0.1`** 不能 `localhost`（IPv6 解析问题）
- **pnpm 11 + Windows**：避开 `pnpm exec`，直接 `node node_modules/<pkg>/...`
- **Auth.js 双文件 split**：`auth.config.ts`（Edge-safe）+ `auth.ts`（Prisma）
- **Session JWT 策略**，不接 PrismaAdapter
- **AI 三段式**：推荐 → 菜谱补全 → 算法编排
- **时间线 V2 反向倒推**：以 targetTime 为 offset=0，所有 step 用负 offset 表达"上桌前 N 分钟"
- **familyId 全局租户键**
- **Next 16 dev 必配 allowedDevOrigins**，否则 127.0.0.1/局域网访问会阻 client bundle 导致 React 不 hydrate
- **批量验证不打断**（用户偏好）

## 5. 当前问题

**本地环境状态**：
- Dev server task `byd3zo1j9`（3000 端口）
- Postgres 容器 `cooking-master-db` Up，5432 端口已绑（restart 修复过一次）
- Chrome CDP 在 9222
- 用户测试中：刚验过登录修复（hydration bug），还没验时间线 V2 + 当餐成员选择效果

**未完成 bug**：无（A-F 全修）

**极空间未部署**：DEPLOY.md 已写完，等用户操作。本地 `docker build` 因 alpine apk 网络短读失败，Dockerfile 配置本身无问题。

## 6. 下一步任务（按优先级）

**马上要做的（接续 5/21 晚的进度）**：

1. **菜品库扩 ~50 道** ⏳ 未做 — 在 `prisma/seed.ts:DISHES` 末尾追加。分类参考用户要求：粤菜 / 湘菜 / 西餐 / 江浙 / 北方 / 川（追加）/ 家常（追加）/ 主食类。每道 3-6 步菜谱 + ingredients/seasonings 即可（参考已有 18 道格式）。我已经留好挂载点，dishes 数组继续 push 就行。注意菜谱里引用的食材名要和扩容后的 INGREDIENTS 对得上（如新加了「茄子」「鸭肉」「八爪鱼」「三文鱼」等，菜谱可以放心用）。
2. **跑 seed 写库** ⏳：`node node_modules/.pnpm/tsx@4.22.1/node_modules/tsx/dist/cli.mjs prisma/seed.ts`（用 upsert，重跑安全）
3. **极空间部署** ⏳ 完整未做。`DEPLOY.md` 里写完了步骤，按它一步步走：本地 `docker build` → push 到 NAS → `docker-compose up -d` → Caddy → `https://dorianweb.com` 验证。本地 build 曾遇 alpine apk 网络问题，可换基础镜像或在 NAS 上直接 build。

**之后再做的（之前积压）**：

4. ~~**#10 邀请**~~ ✅
5. ~~**#11 当日厨师**~~ ✅
6. ~~**Wish→Dish 流程**~~ ✅
7. ~~**菜品做法可视/编辑**~~ ✅
8. ~~**菜单选定→调整→最终确认**~~ ✅
9. ~~**时间线 6 模块**~~ ✅
10. ~~**强制主食**~~ ✅
11. ~~**库存批量删除**~~ ✅
12. ~~**厨具调料预设扩充**~~ ✅
13. **#14 厨师自定义菜单**：跳过 AI 推荐，直接勾菜（实际上 EditingMenuSection 已经接近完成，但起点是有 AI 草稿，可以增一个「不要 AI，直接编菜单」的入口）
14. **#20 厨师评价等级**：按 chefId + Feedback.rating 聚合算等级（见习/家常厨/大厨/厨神），新增 `/family/chefs` 页
15. **库存购买日期显示 + 常用菜模板一键添加**
16. **食材库 UI 支持创建不在库的新 Ingredient**

## 7. 新窗口启动提示词

```
继续推进「厨神」家庭做饭规划系统项目。

项目目录：E:\claude code\cooking master\
计划书：C:\Users\Administrator\.claude\plans\fancy-cooking-cherny.md
交接摘要：.claude/HANDOFF.md（先读，重点看顶部 5/21 状态块和第 6 节）
踩坑：NOTES.md（13 坑 + 21 决策）
跨项目记忆：memory/MEMORY.md

5/21 晚停在这里：菜单流程拆三步（选定→调整→最终确认）✅、时间线 6 模块化 ✅、
强制主食 ✅、库存批删 ✅、厨具调料预设大扩充 ✅、食材 seed 扩到 120+ ✅
（但 seed 还没跑写库）。菜品库扩 50+ 道还没动笔，极空间部署也还没开始。
tsc 零错误。Dev server 后台跑着。

下一窗口接续：
1) 在 prisma/seed.ts:DISHES 末尾追加 ~50 道菜（粤/湘/西餐/江浙/北方/川追加/家常追加）
2) 跑 seed：node node_modules/.pnpm/tsx@4.22.1/node_modules/tsx/dist/cli.mjs prisma/seed.ts
3) 极空间部署，按 DEPLOY.md 走

技术栈：Next.js 16 + React 19 + Prisma 6.19 + Postgres 16 + Auth.js v5 +
Tailwind v4 + DeepSeek API + Docker Compose + Caddy。

环境注意：
- Windows + pnpm 11：用 node node_modules/.pnpm/<pkg>@<v>/.../dist/ 路径
- DATABASE_URL 必须 127.0.0.1（不能 localhost）
- DEEPSEEK_MODEL=deepseek-chat（不是 v4-pro）
- Next 16 dev 必须配 allowedDevOrigins（已配）
- 改 prisma schema 后跑 generate 之前必须先停 dev server（windows 锁 DLL）
```
