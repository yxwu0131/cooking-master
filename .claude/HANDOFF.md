# 项目交接摘要

> **2026-05-26 状态**：本地已 **seed（304 食材/312 菜=68 完整+238 骨架+6 历史/69 菜谱）+ 浏览器全流程点测通过**——2026-05-24 那批 4 项改动（时间线两阶段 / 漏菜兜底 / 牛肉焖饭不重复煮饭 / 库存手动加食材）全部验证 OK（证据见 NOTES.md 2026-05-26 节）。点测中**又修了两个会阻断核心流程的 LLM 输出兼容坑**（坑24 推荐缺料 quantity 字符串→flexNum、坑25 菜谱步骤 heat/cookware null→nullish，改的是 `lib/ai/types.ts`），`tsc`/`eslint` 全过。**仍未推 main**（待用户授权）。生产仍是上一版 https://cook.dorianweb.com（200）。
>
> **下一步**：用户授权 → 推 main → Actions 出镜像 → NAS up -d 上线；再补 NAS 自动备份；最后安卓 APK + UI 美化。

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
- **本批改动已点测通过（2026-05-26）**：seed OK、时间线两阶段 + 菜谱详情展开 + 牛肉焖饭不多煮饭 + 库存手动加食材全部验证；并修了坑24/坑25 两个 LLM 输出兼容 bug（`lib/ai/types.ts`，tsc/eslint 过）。**待用户授权推 main。**
- **未提交的改动**：除 2026-05-24 那批外，本次新增 `lib/ai/types.ts`（flexNum 上移 + missingIngredients/step 字段宽松解析）。git 提交别加 Co-Authored-By。
- **生产自动备份仍未生效**：含 backup 服务的 `docker-compose.prod.yml` 还没同步到 NAS（命令已备好，需用户 `!` scp + ssh up -d backup）。
- 骨架菜首次被选中确认时会触发 DeepSeek 补菜谱（多一次 AI 调用，菜谱详情随后才有内容）。

## 6. 下一步任务（按优先级）
1. **开 Docker → seed → dev 点测本批 4 项改动**（见第 5 节命令）。
2. 验证通过后**用户授权 → 推 main → Actions → NAS up -d** 上线。
3. **补生产自动备份**：把含 backup 的 `docker-compose.prod.yml` 同步到 NAS 跑起 cooking-backup。
4. **第 4 项需求：安卓 APK + UI 美化 + 配图**（用户要求放最后做；建议 PWA→Capacitor 安卓 APK，内容走线上则更新零成本）。
5. 陪用户走家人 onboarding 闭环。
6. 轮换暴露过的密钥（DeepSeek / Supabase）。

## 7. 新窗口启动提示词
```
继续推进「厨神」家庭做饭规划系统。项目目录：E:\claude code\cooking master\
先读 .claude/HANDOFF.md（顶部状态块 + 第5/6节）、NOTES.md、memory/MEMORY.md。
现状：本地完成菜品/食材扩库(304食材/306菜)+时间线两阶段重构+2bug+食材手动添加，tsc/eslint全过，
但未seed/未点测/未推main（Docker没开）。生产仍是上一版 cook.dorianweb.com(200)。
环境：Windows+pnpm11；pnpm db:seed会卡，跑seed用：
  node --env-file=.env node_modules/.pnpm/tsx@4.22.1/node_modules/tsx/dist/cli.mjs prisma/seed.ts
本地DB端口55432(坑22)；改schema前先停dev server；DEEPSEEK_MODEL=deepseek-chat。
时间线用户要"备菜统一、不要做一道切一道"。git别加Co-Authored-By；推main要我明确授权；
NAS远程操作要我用!前缀跑(自动模式拦生产SSH)。
下一步：①开Docker→seed→dev点测本批改动 ②验证OK我授权后推main ③补NAS自动备份 ④最后做安卓APK+UI美化。
```
