# 厨神 · 项目笔记与踩坑日志

> 记录开发过程中遇到的非显然问题、关键技术决策与解决方案。
> 每条记录格式：日期 + 现象 + 根因 + 解法 + 教训。

---

## 2026-05-18 项目初始化阶段

### 坑 1：`create-next-app` 对含空格的目录名拒绝
- **现象**：在工作目录 `E:\claude code\cooking master\` 下运行 `pnpm create next-app .`，报 `name can only contain URL-friendly characters`
- **根因**：`create-next-app` 把目录名当作 npm 包名，npm 包名不允许空格
- **解法**：先在用户目录下用合法名 `cooking-master` 初始化，再把内容复制到目标目录；`package.json` 的 `"name"` 字段可以与目录名解耦
- **教训**：以后建项目目录直接用 kebab-case，避免空格和中文

### 坑 2：pnpm store 跨盘符（C: 与 E:）
- **现象**：把 `node_modules` 从 C: 盘拷贝到 E: 盘后，pnpm 报 `[ERR_PNPM_UNEXPECTED_STORE]` —— 因为它自动想用同盘的 `E:\.pnpm-store`，与已有的 C: 盘 store 不一致
- **解法**：在项目根写 `.npmrc` 锁定 `store-dir=C:/Users/.../pnpm/store/v11`，再 `rm -rf node_modules && pnpm install`
- **教训**：跨盘符的 pnpm 项目一定要在 `.npmrc` 里固定 store 路径，否则每个新盘会重新下载所有依赖

### 坑 3：pnpm 11 的「构建脚本审批」机制
- **现象**：`pnpm install` 完成后报 `[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: @prisma/engines, sharp, esbuild ...`；后续 `pnpm exec prisma generate` 触发 `runDepsStatusCheck` → 失败
- **根因**：pnpm 11 默认拒绝运行第三方包的 `postinstall` 脚本（防止供应链攻击），需要显式批准
- **解法**：在 `pnpm-workspace.yaml` 写：
  ```yaml
  onlyBuiltDependencies:
    - '@prisma/client'
    - '@prisma/engines'
    - prisma
    - esbuild
    - sharp
    - unrs-resolver
    - bcryptjs
  ```
  注意 pnpm 会自动追加 `allowBuilds:` 块（带 placeholder 文本「set this to true or false」），那块是无效配置，但不影响 `onlyBuiltDependencies` 生效
- **教训**：pnpm 11+ 新项目第一步就要写 `onlyBuiltDependencies`，避免后续命令链反复失败

### 坑 4：Prisma 7 的破坏性变更（datasource.url）
- **现象**：`prisma generate` 报 `The datasource property url is no longer supported in schema files`
- **根因**：Prisma 7（2025 年末 GA）改了配置模型：URL 不再写在 `schema.prisma` 的 `datasource` 块里，必须用 `prisma.config.ts` + driver adapter（如 `@prisma/adapter-pg`）；这是为了支持 Edge 运行时
- **决策**：**降级到 Prisma 6.19.3**。理由：
  - 我们自托管在极空间，不需要 Edge 支持
  - Prisma 6 文档全、社区例子多、Auth.js 适配器稳定
  - 等 Prisma 7 生态成熟（适配器/教程齐全）再升级，没意义急着追新
- **教训**：主版本号刚 GA 的库（特别是 ORM 这种基础设施）先观望 3-6 个月，让别人去踩坑

### 决策 1：shadcn/ui 不走 CLI，手写最小结构
- **现象**：`pnpm dlx shadcn init` 在 Windows 上下载 343 个包，多次 ECONNRESET 重试，最后还报 unknown option
- **决策**：跳过 CLI，手动建 `components.json` + `lib/utils.ts`（带 `cn()`），按需手写 `Button/Input/Label/Card` 等组件
- **理由**：shadcn 的本质就是「复制粘贴组件代码」，CLI 只是方便；手写更可控，不依赖网络
- **教训**：shadcn 的 CLI 不是必需品，理解它的工作方式（复制源码到你的仓库）就可以脱离它

### 决策 2：用 Next.js 全栈（API Routes）而不是独立后端
- **理由**：自家用规模（5 人内），独立后端引入跨语言协调成本不值得；Next.js App Router 的 Route Handlers 完全够用；类型贯通前后端
- **触发条件再考虑迁移**：如果未来要做多家庭 SaaS、并发 > 100 RPS、或需要长任务队列（如 AI 推理排队），再拆出 Node/Python 后端

### 决策 3：AI Provider 抽象层
- **位置**：`lib/ai/provider.ts`
- **理由**：当前用 DeepSeek V4 Pro，但 AI 行业每 6 个月有变动，写抽象层未来切通义/豆包/Claude 只换实现，不动业务代码
- **接口**：所有调用走结构化输入输出（schema 校验用 zod），不暴露 provider 细节

### 坑 5：`pnpm exec` 触发 dep status check 死循环
- **现象**：`pnpm exec tsc --noEmit` 报 `runDepsStatusCheck failed`，因为 pnpm 11 在 exec 前会自动验证依赖完整性，发现 ignored builds 后调起 install，install 又因 build 审批失败
- **解法**：直接用 node 调用 binary 绕过 pnpm exec：
  ```bash
  node node_modules/typescript/bin/tsc --noEmit
  node node_modules/prisma/build/index.js generate
  ```
- **教训**：pnpm 11 + Windows + 有 ignored builds 的项目，命令脚本里尽量直接用 node 调用，不走 pnpm exec/run

### 决策 4：Auth.js v5 双文件 split（auth.ts + auth.config.ts）
- **理由**：middleware.ts 运行在 Edge runtime，不能 import Prisma（含 Node-only 依赖）。Auth.js 官方推荐拆成：
  - `auth.config.ts`：纯配置，Edge-safe，给 middleware 用
  - `auth.ts`：完整 NextAuth 实例（含 Credentials provider + Prisma），给 server actions / route handlers 用
- **教训**：Edge runtime 隔离是 Auth.js v5 最容易被忽视的限制，不拆分会在生产 build 时炸

### 决策 5：暂不接 PrismaAdapter
- **背景**：用 Credentials provider + JWT session 时，PrismaAdapter 不是必需。但仍保留了 `Account/Session/VerificationToken` 表，给将来接 OAuth（如微信扫码）留底
- **现状**：当前 session strategy 是 JWT，不会写 Session 表
- **若要接 PrismaAdapter**：把 `adapter: PrismaAdapter(prisma)` 加到 `auth.ts` 的 NextAuth 配置里，并改 session strategy 为 `database`

---

## 2026-05-18 P1 MVP 阶段

### 决策 6：AI 推荐 → 菜谱补全 → 算法编排 的三段式
- **背景**：AI 推荐时可能返回菜品库里没有的新菜（如 AI 临时原创），但做饭时间线需要完整菜谱才能编排
- **方案**：分三步而不是让 AI 一次性返回所有内容
  1. **推荐阶段**：AI 只返回方案列表（菜名 + 理由 + 缺料），快、便宜
  2. **菜谱补全（确认时触发）**：`lib/planning/ensure-recipes.ts` 检测 dish 没有 Recipe 的，调 AI 补全菜谱（食材/步骤/火候）
  3. **算法编排**：`lib/planning/cooking-plan.ts` 根据菜谱步骤 + 锅具/灶眼约束生成时间线
- **理由**：让 AI 做擅长的事（理解口味、组合菜单），算法做擅长的事（依赖排序、冲突检测）。错开调用减少单次 AI 输出长度，降低失败率
- **位置**：`lib/actions/menu.ts` 的 `confirmMenuAction` 串联这三段
- **教训**：复杂任务不要让 AI 一次干完——分段每段更可控

### 决策 7：时间线算法 V1 用"按角色排优先级"
- **位置**：`lib/planning/cooking-plan.ts`
- **逻辑**：
  - 主食（米饭）优先级 0（最先启动，电饭锅长时间不占灶）
  - 长耗时炖菜 优先级 1（提前做）
  - 常规快炒 优先级 2
  - 汤 优先级 3（靠后做避免变凉）
  - 叶菜 优先级 4（最后做避免变黄）
- **V1 简化**：每道菜按优先级顺序串行启动，下道菜在前道开始后 3 分钟启动（让 prep 步骤并行）
- **V2 计划**：加入更严格的锅具/灶眼资源调度，约束求解器，让真正冲突的步骤强制错开
- **教训**：先做能跑的简单算法，等真实使用积累足够 case 再升级

### 决策 8：分页面用 router groups 隔离 layout
- **结构**：`app/(auth)/...` 和 `app/(app)/...` 两个 group
- **理由**：`(auth)` 用居中卡片布局，`(app)` 用顶部 + 移动端底部双导航。router group 让 layout 自动嵌套而不污染 URL
- **教训**：不要把所有页面塞在一个 layout 下做条件渲染，用 router group 更干净

### 坑 6：Prisma 6 + pnpm 11 的种子脚本入口
- **问题**：`package.json` 的 `"prisma": { "seed": "tsx prisma/seed.ts" }` 在 Prisma 7 会报弃用警告但仍可用；Prisma 6 完全支持
- **解法**：定义两种入口：
  - 自动：`prisma db seed` 命令会读取 `package.json#prisma.seed`
  - 手动：直接 `node node_modules/tsx/dist/cli.mjs prisma/seed.ts`
- **教训**：跨工具调用链多的项目，手动入口比"自动魔法"更可靠

### 决策 9：family preference 用 tasteFlags JSON 而不是表列
- **背景**：偏好标志（清淡/下饭/不辣等）会不断演进
- **方案**：`FamilyPreference.tasteFlags` 是 JSONB，存 `{light: true, lowOilSalt: false, ...}`
- **vs 表列**：表列需要每次新增标志就跑 migration；JSONB 灵活，但失去类型校验
- **折中**：业务层用 zod schema 校验，TypeScript 类型也明确列出已知标志，但底层存储灵活
- **教训**：把"稳定的事实"放表列（id/familyId/createdAt），"会演进的偏好"放 JSONB

---

## 2026-05-20 本地端到端验证阶段

### 坑 7：Docker Desktop 走 sing-box 代理走不通
- **现象**：`docker pull` 报 `connecting to host.docker.internal:10833: connection refused`
- **根因**：Docker Desktop 设置里把 HTTP/HTTPS proxy 配成 `host.docker.internal:10833`，但 sing-box 只 bind 在 `127.0.0.1:10833`。Docker Desktop 跑在 Linux VM 里，从 VM 角度 `host.docker.internal` 解析到主机外网 IP（如 `192.168.1.46`），访问不到主机 loopback 上的代理
- **解法**：用 Windows 系统里现成的 portproxy 转发（`netsh interface portproxy show all` 已配 `0.0.0.0:10834 → 127.0.0.1:10833`），把 Docker Desktop 代理改为 `host.docker.internal:10834`，重启 Docker Desktop
- **配置位置**：`%APPDATA%\Docker\settings-store.json` 的 `OverrideProxyHTTP/HTTPS` 字段；改完必须重启整个 Docker Desktop（关 `Docker Desktop.exe` + `com.docker.backend` 等全套）
- **教训**：Docker Desktop 的代理设置是从 VM 视角，主机 `127.0.0.1` 在 VM 里访问不到；要么让代理 bind `0.0.0.0`，要么走 portproxy

### 坑 8：DATABASE_URL 用 `localhost` 在 Windows Node 解析为 IPv6
- **现象**：Prisma 报 `P1001 Can't reach database server at localhost:5432`，但 `docker exec pg_isready` 正常；从 Bash/WSL 工具调用 `prisma db push` 也成功
- **根因**：Node.js 18+ 把 `localhost` 解析为 `::1`（IPv6）而不是 `127.0.0.1`。Docker `-p 5432:5432` 默认只在 IPv4 接口暴露端口，所以 Windows 下 Next.js dev server（Node）连不到 IPv6 的 5432，而 Bash 环境因 DNS 解析行为差异能通
- **解法**：`.env` 的 `DATABASE_URL` 用 `127.0.0.1` 不用 `localhost`
- **教训**：Docker 暴露端口要么显式 `-p 127.0.0.1:5432:5432`（强制 IPv4），要么连接串就用 IP 直连，避免 IPv6 解析问题

### 坑 9：DeepSeek reasoning model 调用极慢
- **现象**：`deepseek-v4-pro` 调用菜单推荐 prompt，跑满 180s timeout 仍未返回；任务复杂度（55 食材 + 18 菜谱全量 prompt）让 reasoning 阶段非常耗时
- **关键发现**：`deepseek-v4-pro` 是 reasoning model（响应里有 `reasoning_content` 字段），跟非推理模型 `deepseek-chat` 的延迟数量级不同
- **解法**：
  - 把 `lib/ai/deepseek.ts` 的 AbortController timeout 从 60s 调到 180s
  - `.env` 的 `DEEPSEEK_MODEL` 切到 `deepseek-chat`（菜单推荐这种结构化任务用非推理模型够用，速度快十倍以上）
  - 已知 `deepseek-chat` 在 2026-06 会下线，到时候切到 flash 类模型
- **教训**：reasoning model 适合开放性思考（数学/代码推理），结构化输出（按 schema 出 JSON）用非推理模型反而更快、更便宜，质量也不差

### 验证发现的 non-blocking bug 清单（待修）
做过端到端验证后整理，按用户影响度排序。**部署完毕后再批量处理**。

#### A. Session 时间显示时区偏差 8h（中）
- **现象**：用户填的开饭时间 `02:30`，session 页面渲染成 `10:30`，CST↔UTC 偏差
- **可能根因**：`session.scheduledAt` 存的是 UTC，但 UI 没用 `toLocaleString("zh-CN", {timeZone: "Asia/Shanghai"})` 而是直接 `new Date(...).toLocaleString()`，依赖运行环境（dev 在中国，prod 容器是 UTC）
- **位置**：`components/cook/session-workspace.tsx` 顶部信息条
- **修法**：所有时间渲染统一走一个 `formatLocal(date)` 工具，强制 `Asia/Shanghai`

#### B. AI 错误信息直接暴露原始 Error.message（中）
- **现象**：AI 调用 abort 时页面显示 `"This operation was aborted"`（DOM exception 的英文 message）
- **位置**：`lib/actions/menu.ts:176` 直接把 `e.message` 透传
- **修法**：在 try/catch 里把已知错误（AbortError、schema 校验失败、HTTP 5xx）映射为中文用户友好提示，未知错误才走 fallback

#### C. 采购清单同食材异名未合并（中）
- **现象**：同一份采购清单里出现 `姜 0.7 小块` + `生姜 0.7 块`、`大蒜 5 瓣` + `蒜 2 瓣`、`鸡翅 5.4 个` + `鸡翅中 5.4 个`
- **根因**：AI 不同菜谱用了同食材的不同叫法，`lib/planning/shopping-list.ts` 的归并键是字符串 name，没做别名表
- **修法**：建一个 ingredient alias map（姜≈生姜、蒜≈大蒜、鸡翅≈鸡翅中…），归并时先 normalize
- **进阶**：让 AI 在生成菜谱时统一引用 Ingredient 表的 canonical name，源头根治

#### D. `toggleQuickPick` 闭包陷阱（低）
- **位置**：`components/inventory/inventory-client.tsx:124-128`
- **现象**：批量选食材时连点（自动化测试触发）只生效最后一次，因为 `setQuickPick(new Set(quickPick))` 用闭包捕获的旧 state
- **真实场景影响**：用户慢速点没问题；快速双击会丢
- **修法**：改为 functional setState：`setQuickPick(prev => { const next = new Set(prev); ... return next; })`

#### E. 批量加食材默认数量"1 g"对肉/米不合理（低）
- **现象**：勾选"五花肉"添加，记录是 `1 g`；大米也是 `1 g`
- **位置**：`lib/actions/inventory.ts` 的 `bulkAddInventoryAction`
- **修法**：批量添加时按 ingredient 类别给合理默认：肉类 500g、米面 1kg、蔬菜 1 个/颗、调料按 unit 给 typical 量

#### F. Next.js 16 deprecate `middleware`（低）
- **现象**：dev server 启动 warning `The "middleware" file convention is deprecated. Please use "proxy" instead.`
- **背景**：Next 16 引入新的 `proxy.ts` 文件约定替代 `middleware.ts`（同样在 Edge 运行）
- **修法**：把 `middleware.ts` 改名为 `proxy.ts`（如 Next 16 不强制 breaking 暂可留，但 17 可能 break）

---

## 2026-05-20 二次验证阶段（bug 批量修 + dev 复跑）

### 坑 10：Next 16 dev 默认拒绝跨 origin，client bundle 不加载 → React 不 hydrate
- **现象**：浏览器从 `http://127.0.0.1:3000`（不是 `localhost`）打开页面，所有 `<form onSubmit>` 失效，表单退化成原生 GET 提交，URL 变成 `/login?email=xxx&password=yyy`，DOM 上的 `form.__reactProps$xxx` 是空对象
- **关键日志**：dev server 打印 `⚠ Blocked cross-origin request to Next.js dev resource /_next/webpack-hmr from "127.0.0.1"`
- **根因**：Next 16 把任何非 `localhost` 的 host（包括 `127.0.0.1`、局域网 IP）都当跨域，默认阻止 `_next/*` 静态资源加载，client JS bundle 拿不到，React 无法 hydrate
- **解法**：`next.config.ts` 加 `allowedDevOrigins: ["127.0.0.1", ...]`，重启 dev server
- **教训**：开发期表单"看起来在加载但点击没反应"，第一时间检查 `form` 的 `__reactProps$` 是否为空；Next 16+ dev 的 origin 限制比 Next 14/15 严格很多

### 坑 11：Docker Desktop 全量重启后容器端口绑定丢失（但配置仍在）
- **现象**：`docker start cooking-master-db` 成功，`docker ps` 显示 Up，但 Windows 主机上没人 listen 5432，prisma 报 `Can't reach 127.0.0.1:5432`
- **关键现象**：`docker inspect ... .NetworkSettings.Ports` 返回 `{"5432/tcp":[]}`（实际绑定为空），但 `.HostConfig.PortBindings` 显示 `[{HostIp:"", HostPort:"5432"}]`（配置完整）
- **解法**：`docker restart cooking-master-db` 一次，端口重新绑定成 `0.0.0.0:5432` + `[::]:5432`
- **教训**：Docker Desktop 异常关闭后，`start` 不一定能恢复端口映射；遇到能连 docker exec 但 host 连不上端口的情况，直接 restart
- **2026-05-21 补订**：本次复发时 **`docker restart` 不够**——restart 后 `docker port` 仍为空、host 5432 仍无 listen，必须用完整 `docker stop && docker start` 才重建端口代理（`docker port` 才显示 `0.0.0.0:5432`/`[::]:5432`）。另外本次 Docker Desktop 守护进程整个没起（`docker ps` 报 `dockerDesktopLinuxEngine ... cannot find the file`），要先 `Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"` 再轮询 `docker info` 等引擎就绪。可靠顺序：起 Docker Desktop → 等 `docker info` OK → `docker stop+start <db>` → `docker port` 确认 host 端口 → 跑 seed。
- **2026-05-22 再补订**：上面 stop+start 的修法**也会失灵**——真正根因见 **坑 22**（Windows 动态端口范围 1024–14999 把 5432 抢走，Docker 静默绑不上）。当 restart/stop+start/删重建/`wsl --shutdown` 全部无效时，改用范围外 host 端口（如 55432）即可。

### 决策 10：时间统一走 `lib/format.ts`，强制 Asia/Shanghai
- **位置**：`lib/format.ts`
- **暴露 API**：`formatLocal / formatTime / formatDate / toDatetimeLocalValue`
- **理由**：开发机在 CST、生产容器在 UTC（即使设了 `TZ` env，Node 的 `toLocaleString` 默认仍按 process timezone），统一在 helper 里固定 `timeZone: "Asia/Shanghai"` 是最可靠的修法
- **细节**：`toDatetimeLocalValue` 用 `Intl.DateTimeFormat` 的 `formatToParts` 而不是 `toISOString().slice(0,16)`，避免 UTC↔CST 偏差

### 决策 11：采购清单合并改用 canonical name + unit 组合键
- **位置**：`lib/planning/shopping-list.ts`
- **算法**：先用 `Ingredient.aliases` 表把 AI 返回的别名（生姜/大蒜/鸡翅中）normalize 到主名（姜/蒜/鸡翅），再以 `${name}::${unit}` 为合并键
- **副作用**：同名不同单位（如 "蒜 5 瓣" + "蒜 50 g"）会分两条，业务上反而更准确（不强行加法）

### 决策 12：批量加食材的默认数量按类别推断
- **位置**：`lib/actions/inventory.ts` 的 `defaultQuantityFor(category, unit)`
- **规则**：肉类 500g、米面 1kg、蔬菜 1 个/300g、蛋奶 6 个/250ml、调料 50g、其他 1
- **触发**：客户端 `bulkAddInventoryAction` 不传 quantity，让服务端按 category 推断

### 决策 13：AI 错误信息中文映射
- **位置**：`lib/actions/menu.ts:mapAIErrorToChinese`
- **覆盖**：AbortError / JSON parse fail / 5xx / 401 / 429 / network error → 各自中文友好提示
- **教训**：server action 的 error 直接透传到 toast，必须先 normalize；保留 `console.error` 给开发者，给用户的只是分类后的中文短句

### 验证发现的剩余事项
- Docker build：本地试跑了 `docker build`，进入 deps 阶段时 `apk add libc6-compat openssl` 因网络短读失败（`expected 52MB but got 40MB`）。Dockerfile 配置本身没问题，问题在代理/网络。极空间侧用国内镜像源应该 OK。如需稳定，考虑切到 `node:22-bookworm-slim` 或预先 docker pull 缓存 alpine 包

---

## 2026-05-20 #10 多账户邀请注册

### 决策 14：邀请码消费用 prisma.$transaction 包注册全流程
- **位置**：`lib/actions/auth.ts:registerAction`（mode=invite 分支）
- **背景**：邀请码注册要做 4 件事：创建 User、消费 InviteCode（usedAt/usedBy）、设置 familyId、建 FamilyMember
- **方案**：全部塞进 `prisma.$transaction(async tx => ...)` —— 任一失败回滚，避免出现"用户创建了但邀请码没消费"或"邀请码消费了但家庭关联失败"的中间态
- **副作用**：`consumeInviteCodeInTx` 不能放在 `"use server"` 文件里（参数 tx 非可序列化），单独放 `lib/invite-helper.ts`
- **教训**：Server Actions 文件的 export 全是 client 可调用的 RPC，签名必须可序列化；内部辅助函数（特别是接 Prisma tx 的）要拆到普通 module

### 决策 15：邀请码 charset 去除易混淆字符
- **位置**：`lib/actions/invite.ts:CODE_CHARSET`
- **规则**：去掉 0/O/1/I/L，8 位长度，组合空间约 31^8 ≈ 8.5×10^11
- **理由**：邀请码会念给家人听，避免 O/0 之类抄错；自家场景规模小，碰撞概率可忽略，但仍做 5 次重试兜底
- **教训**：人工传播的 token 优先考虑可读性，不是最大熵；要传播 URL 而不是 code 本身就上随机字符串

### 坑 12：Next 16 client page 用 useSearchParams 必须包 Suspense
- **现象**：`/register` 用 `useSearchParams` 读 `?invite=`，Next 16 build 时报 `useSearchParams() should be wrapped in a suspense boundary`
- **解法**：把 form 拆到 `register-form.tsx`（"use client" + useSearchParams），server page 用 `<Suspense fallback={...}><RegisterForm/></Suspense>` 包起来
- **教训**：Next 15+/16 对 useSearchParams 的 Suspense 要求比 14 严格；任何会读 search params 的 client component 都要有 Suspense 边界，否则会阻止静态生成

### 决策 16：注册页 mode 用 discriminatedUnion 而不是 optional
- **位置**：`lib/actions/auth.ts:registerSchema`
- **理由**：邀请注册 vs 自建家庭是互斥语义——前者没有 familyName 字段，后者没有 inviteCode 字段。用 zod discriminatedUnion('mode') 让两个 schema 独立校验，error message 更准；比"所有字段都 optional 然后业务层 if-else"清晰
- **教训**：表单分支语义优先用 discriminatedUnion；optional 字段堆叠很快会让 schema 失去文档价值

---

### 端到端验证证据（2026-05-20）
- 注册 → JWT cookie 写入 → 自动建 family + member
- 食材库存：8 种食材成功批量加入
- AI 推荐（deepseek-chat）：3 套方案，~30s 返回，包含"库存仅 1 个鸡蛋，汤味稍淡"这类细节
- 确认方案后：自动生成 24 条采购清单（按 area 分区 + isHave 标记库存）+ 完整时间线（含并行步骤、锅具冲突提示）
- 反馈：4 星 + 标签 `[好吃,下次还做]` + 备注，写入 `Feedback` 表（rating/tags/comment 列）

---

## 2026-05-20 三轮迭代：#11 当日厨师 + 数据建模重构

### 决策 17：当日厨师机制（#11）
- **位置**：`lib/actions/meal-session.ts`、`lib/actions/menu.ts`、`components/cook/*`
- **设计**：
  - `MealSession.chefId` 已存在；新建 session 时若家庭多账户，UI 出选择器，默认当前用户
  - 后端在 createSession 校验 `chefId ∈ Family.users`；generate/confirm/start/finish/cancel 五个写操作全部校验 `session.chefId === currentUser.id`
  - 前端 `SessionWorkspace` 接收 `currentUserId`，按 `isChef` 控按钮：非厨师只能点菜和给反馈，按钮 disabled 并显示「等厨师...」
  - 列表页 / 详情页 Header 都打 chef 名字 + 「我」徽章
- **理由**：避免家人乱拍菜单或乱开火，明确"谁是今天的负责人"，也为后续 #20 厨师等级聚合奠基

### 决策 18：做饭熟练度从 KitchenProfile 迁到 FamilyMember
- **位置**：`prisma/schema.prisma`、`scripts/migrate-skill-and-wish.ts`、`lib/ai/types.ts:chef`、`lib/planning/cooking-plan.ts`
- **变更**：
  - 删除 `KitchenProfile.skillLevel / maxComplexity`
  - 新增 `FamilyMember.cookingSkill?: SkillLevel`、`maxComplexity?: Int`（nullable，不下厨可留空）
  - AI 输入加 top-level `chef: { name, skillLevel, maxComplexity }`，由 `session.chef → FamilyMember(userId=chefId)` 取值
  - 时间线生成的 skillMultiplier 改用 chef 的熟练度
- **理由**：熟练度是「谁掌勺」的属性，不是「厨房」的属性；同一厨房不同成员做出来的时长不一样
- **数据迁移**：写 idempotent SQL 脚本，先 ADD 新列、UPDATE FROM 拷贝（按 ADMIN/CHEF 用户的 FamilyMember），再 DROP 旧列；用 `node node_modules/.pnpm/tsx@<v>/node_modules/tsx/dist/cli.mjs scripts/...` 跑
- **教训**：纯 ALTER 由 prisma db push 处理会丢数据；遇到字段搬家，写一次性脚本 = ADD + UPDATE + DROP 三步一气呵成最稳

### 决策 19：Wish 灵感库支持手写做法 → AI 补全入菜品库
- **位置**：`prisma/schema.prisma:Wish.manualRecipe`、`lib/actions/dishes.ts:parseWishToDishAction`、`lib/ai/{types,prompts,deepseek}.ts:wishToDish`
- **设计**：
  - Wish 加 `manualRecipe?: String`（textarea）
  - 新增 `AIProvider.wishToDish({rawWish, manualRecipe, ...约束})`：用户写了做法的就优先沿用其中食材/份量/火候，没写就按家常补全
  - 输出复用 `recipeGenerateOutputSchema` 加 `dishName`，写入时 `prisma.dish.upsert(by name)` + `prisma.recipe.upsert(by dishId)` + `familyDish.upsert(WANT_TO_TRY)` + `wish.parsedDishId = dish.id`
  - 灵感卡片新增「AI 入库」按钮、铅笔图标可编辑 manualRecipe 草稿；含做法时打 Badge
  - `source` 字段：有 manualRecipe 设 USER_INPUT，否则 AI_GENERATED
- **理由**：之前 wish 只是个许愿池，要做的话还得手动建 Dish/Recipe；现在打通"灵感 → 入菜品库"的最后一公里
- **避坑**：在 prompt 里硬约束「不要擅自换主料/火候/调味」，让 AI 老老实实做补全而不是重写

### 决策 20：菜品做法可视/可编辑（#新增）
- **位置**：`components/dishes/dish-recipe-view.tsx`、`lib/actions/dishes.ts:updateDishRecipeAction`、`app/(app)/dishes/[id]/page.tsx`
- **设计**：详情页用 client 组件统一管 view/edit 双模式；编辑器支持：
  - 基础字段（菜系/总时长/人份/难度/标签/flags）
  - 食材 & 调料（增删改、可选标记）
  - 步骤（增删改、上下移、stepType 下拉、火候/厨具/并行开关）
  - 小贴士 / 火候说明
- 保存时 step.order 重新发号；用 `prisma.$transaction([dish.update, recipe.upsert])` 原子化
- **理由**：AI 补全的菜谱可能要微调（份量、火候、本地食材替换）；不能只读

### 坑 12：Prisma client 重新生成被 dev server 锁住 DLL
- **现象**：schema 改完跑 `prisma generate` 报 `EPERM: operation not permitted, rename query_engine-windows.dll.node.tmp...`
- **根因**：Next.js dev server 进程在用 prisma client，windows 下不允许覆盖正在使用的 DLL
- **解法**：先 `taskkill //F //PID <next-dev-pid>` 停 dev server，再 generate，再起 dev
- **教训**：Windows + Next 16 dev + Prisma 改 schema 的标准流程：停 dev → migrate/push → generate → tsc → 起 dev

### 坑 13：tsx CLI 在 pnpm hoist 下的路径
- **现象**：`node node_modules/tsx/dist/cli.mjs scripts/x.ts` 报 No such file
- **根因**：pnpm 不会把可执行入口 hoist 到 node_modules 顶层，只在 `.pnpm/<pkg>@<v>/node_modules/<pkg>/dist/` 里
- **解法**：用 `node node_modules/.pnpm/tsx@4.22.1/node_modules/tsx/dist/cli.mjs ...`（或写 `pnpm tsx`，但本项目避开 `pnpm exec`）
- **教训**：pnpm 11 项目所有"按文件路径调命令"的写法都要走 `.pnpm/<pkg>@<v>/.../dist/` 而不是顶层 node_modules

### 决策 21：Wish 入库写法 vs ensure-recipes 写法的区别
- **位置**：`lib/actions/dishes.ts:parseWishToDishAction` vs `lib/planning/ensure-recipes.ts`
- **区别**：
  - `ensureRecipes`：菜单确认时补 AI 生成的占位菜，**只 update 已存在的 Dish**（dishId 已在 MenuDish 里）
  - `parseWishToDish`：从无到有，需要 **upsert Dish(by name)**，并自动加入 FamilyDish
- **教训**：两条 AI → Recipe 路径不要硬合并，业务语义不一样：前者补的是「已经被推进 Menu 的菜」、后者新建「想试的菜」

---

## 2026-05-21 菜品库扩容 + UI 暖色重设计

### 决策 22：菜品 seed 扩到 ~68 道（粤/湘/西餐/江浙/北方/川/家常/主食）
- **位置**：`prisma/seed.ts:DISHES` 末尾追加 50 道，覆盖 8 大菜系；每道 3-6 步菜谱 + ingredients/seasonings，食材名全部对齐扩容后的 `INGREDIENTS`（214 项）
- **写库**：`stepType`/`heat` 是 TS 字面量 union，tsc 把关；recipe.ingredients 是 JSON 字段（非 FK），引用不在库的食材也不会报错但会影响采购清单匹配，所以仍按食材库命名
- **实际入库**：DB 里现有 74 道（含历史 AI/手动新增 6 道），seed upsert by name 安全可重跑

### 决策 23：UI 从灰阶 shadcn 默认改为「暖色食欲」主题
- **位置**：`app/globals.css` 的 `:root`/`.dark` token 全量重写
- **配色**：奶油底 `oklch(0.992 0.008 80)` + 番茄橙主色 `oklch(0.65 0.18 42)` + 暖棕文字 + 香草绿点缀（新增 `--fresh` token，已在 `@theme inline` 注册，用 `bg-fresh/text-fresh`）；`--radius` 0.625→0.75rem；body 顶部加暖橙径向光晕
- **依据**：调研业界食谱 App 共识——暖橙引发食欲、奶油底衬托、3-5 色克制、无图时用 emoji/色块补温度
- **连带改动**：`app-nav`（橙色 logo 徽章 + pill active 态 + 移动底栏高亮）、`dashboard`（渐变 hero CTA + 4 张彩色统计卡）、`badge`（加 `soft`/`fresh` 变体）、`card`（shadow→shadow-sm）、`dishes-browse`（按菜系/属性给每道菜加 emoji 头像 + 暖色标签）、`(auth)/layout`（渐变背景）
- **验证**：CDP 截图核对 login/dashboard/dishes 三页观感 OK，tsc 零错误。验证用的临时账号 `uitest@local.dev` 已删除

---

## 2026-05-22 部署就绪性修复（发现 3 个会导致 NAS 部署失败的阻断点）

### 坑 14：standalone 生产镜像 + 无 migrations + 缺 prisma CLI/tsx → 部署必崩
- **现象（本地审查发现，未到 NAS 就拦下）**：原 `docker-compose.yml` 的 web 启动命令是 `node node_modules/prisma/build/index.js migrate deploy && node server.js`，但有三重问题：
  1. **没有 `prisma/migrations/` 目录**（开发期全程用 `prisma db push`），`migrate deploy` 不会建任何表 → 生产库空 → 应用崩
  2. **runner 镜像不含 prisma CLI**：Dockerfile runner 只 `COPY` 了 `@prisma/client` 和 `.prisma`，没复制 `node_modules/prisma`（CLI），`migrate deploy` 引用的 `node_modules/prisma/build/index.js` 不存在 → web 循环重启
  3. **seed 没法在生产镜像跑**：standalone runner 不带 tsx，`prisma db seed` 也依赖 tsx
- **根因**：Next standalone 只 trace 应用 import 到的包，prisma CLI / tsx 都不会进 runner；pnpm 的 symlink node_modules 也没法简单 COPY 进 slim 镜像
- **解法**：加一个**一次性 `migrate` 服务**用 builder 阶段镜像（`target: builder`，含全量依赖 + seed.ts），命令 `prisma db push --skip-generate && tsx prisma/seed.ts`，跑完退出；web 改成纯 `node server.js` + `depends_on: migrate: service_completed_successfully`。CLI 路径走符号链接解析的 `node_modules/prisma/build/index.js` 和 `node_modules/tsx/dist/cli.mjs`（不用 `.bin/tsx`，那是 shell shim、`node` 调不动；也不硬编码 `.pnpm/<v>` 版本号）
- **教训**：Next standalone + Prisma 部署，建表/种子这类"需要 CLI 工具"的活不要塞进 slim runner，用 builder 镜像跑一次性 init 容器最干净；上线前一定本地 `next build` + `docker compose config` 验一遍，别假设 compose 命令在生产镜像里有对应二进制

### 决策 24：部署分 LAN / public 两个 profile
- **背景**：用户前置条件（域名 DNS、公网 IP）都没齐，但 DeepSeek Key 是硬门槛（compose `:?required` + 核心功能）
- **做法**：Caddy 放进 `profiles: ["public"]`；新增 `docker-compose.lan.yml` override 把 web 暴露到 `3000`。LAN 部署 `docker compose -f docker-compose.yml -f docker-compose.lan.yml up -d`（无 caddy，http 内网访问），public 部署 `docker compose --profile public up -d`（加 caddy+TLS）
- **坑中坑**：compose 变量插值发生在 profile 过滤**之前**，所以被 profile 排除的 caddy 服务里的 `LETSENCRYPT_EMAIL:?required` 仍会在 LAN `up` 时报错 → 改成 `${LETSENCRYPT_EMAIL:-}` 默认空 + 文档要求 public 时填
- **教训**：用 profile 隔离可选服务时，该服务里的 `${VAR:?}` 必填变量要降级成带默认值，否则 LAN 启动会被公网专用变量卡住

---

## 2026-05-22 极空间实战部署（GHCR 镜像 + Cloudflare Tunnel + 两个镜像构建坑）

### 决策 25：弃用 NAS 本地构建，改 GitHub Actions 构建推 GHCR
- **背景**：极空间 SSH 账号沙箱化（`HOME=/home` 只读、仅 `/tmp` 可写、docker 必须 sudo、无免密 sudo），无法在 NAS 上 clone 代码到持久目录 + `docker compose build`。且现有项目（`child-growth`）本就是 **GHCR 镜像 + watchtower 自动更新**模式，端口 3000 已被它占用。
- **做法**：`.github/workflows/docker-build.yml` 推 main 自动构建：`runner` 目标→`ghcr.io/yxwu0131/cooking-master:latest`（web）、`builder` 目标→`:migrate`（含 prisma CLI+tsx，跑 db push+seed）。`docker-compose.prod.yml` 拉镜像跑 db+migrate+web，web 暴露 **3001**（避开 3000），复用现有 cloudflared 隧道，Cloudflare 后台加 `cook.dorianweb.com → NAS-IP:3001`，TLS 全托管，不用 Caddy。
- **教训**：NAS 沙箱严的环境，别跟它硬刚本地构建；顺着它已有的「镜像仓库+watchtower」习惯走，CI 出镜像、NAS 只拉，最省心。

### 坑 15：本地 .npmrc 的 Windows store-dir 路径毒化 Docker 构建
- **现象**：CI 构建 runner 镜像第一次失败，定位到 `pnpm install` 阶段。
- **根因**：`.npmrc` 里有 `store-dir=C:/Users/Administrator/AppData/Local/pnpm/store/v11`（坑 2 留下的本机配置），Dockerfile `COPY .npmrc* ./` 把它带进 Linux 容器，pnpm 拿 Windows 路径当 store 直接崩。
- **解法**：Dockerfile 不再 COPY `.npmrc`，并把 `.npmrc` 加进 `.dockerignore`。peer 设置用 pnpm 默认值即可，`--frozen-lockfile` 不受影响。
- **教训**：凡是写了绝对路径/本机专属配置的文件（.npmrc、本地 .env），都要确保不被带进镜像。

### 坑 16：pnpm 11 在纯净容器里 ERR_PNPM_IGNORED_BUILDS 退出 1
- **现象**：修了 .npmrc 后仍在 `pnpm install --frozen-lockfile` 失败：`[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: @prisma/client, @prisma/engines, esbuild, prisma, sharp, unrs-resolver`，退出 1。
- **根因**：pnpm 11 默认拦截依赖的 build 脚本并以错误退出。`onlyBuiltDependencies`（package.json 和 pnpm-workspace.yaml 都写了）在纯净容器的 `--frozen-lockfile` 安装里**没生效**（本机能装是因为 store/node_modules 已构建过、审批被记住）。lockfile 的 `settings:` 段也没记录构建审批。
- **解法**：Dockerfile 改成 `RUN pnpm install --frozen-lockfile ...; pnpm rebuild @prisma/client @prisma/engines prisma esbuild sharp unrs-resolver`——用 `;` 让安装阶段的拦截不致命，再显式 `pnpm rebuild` 把原生包（prisma 引擎/esbuild/sharp）真正构建出来。本地 deps 阶段验证通过。顺手删了 pnpm-workspace.yaml 里 pnpm 自动塞的非法 `allowBuilds` 占位块。
- **教训**：pnpm 10/11 的 build-script 审批机制在 CI/Docker 纯净环境经常不认 `onlyBuiltDependencies`；最稳的是装完显式 `pnpm rebuild <需要原生构建的包>`，别指望审批配置在容器里自动生效。
- **附**：本地 `docker build` 还会遇到 npm registry 拉包超时（`error (23) operation aborted`），那是本机 sing-box 代理问题（坑 7 同源），GitHub Actions 干净网络无此问题。

### 坑 17：pnpm 布局下 Next standalone 不带 prisma 生成产物
- **现象**：deps/builder 都通过、`next build` 成功后，runner 阶段 `COPY --from=builder /app/node_modules/.prisma` 报 `not found`。
- **根因**：pnpm 不把包平铺到顶层 `node_modules`，prisma generate 把「生成的 client + 查询引擎」写进 `node_modules/.pnpm/@prisma+client@<版本+hash>/node_modules/.prisma/`。Next standalone 只 trace 了 `@prisma/client` 包本身（`.next/standalone/node_modules/@prisma/client`），没带上那个 `.prisma`（含 `libquery_engine-linux-musl-openssl-3.0.x.so.node`）。顶层 `node_modules/.prisma` 和 `node_modules/@prisma/client` 在 pnpm 下都不存在 → 原 Dockerfile 的 npm 式拷贝路径全错。
- **解法**：runner 阶段用 glob 从 .pnpm 路径补进 standalone：`COPY --from=builder /app/node_modules/.pnpm/@prisma+client@*/node_modules/.prisma ./node_modules/.prisma`（`*` 匹配版本+hash 段，不跨 `/`）。删掉原来对 `node_modules/.prisma` 和 `@prisma/client` 的两条显式拷贝（后者 standalone 已自带）。验证：`docker run runner node -e "new (require('@prisma/client').PrismaClient)()"` 打印 client OK、引擎可解析。
- **教训**：pnpm + Prisma + Next standalone 三者组合，生成的 client/引擎不会自动进 standalone，必须从 `.pnpm/@prisma+client@*/node_modules/.prisma` 手动补；别套用 npm 的 `node_modules/.prisma` 顶层路径。

---

## 2026-05-22 极空间 NAS 实战部署落地（cook.dorianweb.com 上线）

**最终成功路径**：GitHub Actions 构建镜像推 GHCR → NAS `sudo docker compose -f docker-compose.prod.yml up -d` 拉镜像跑 db+migrate+web（web 暴露 3001）→ 复用现有 cloudflared 隧道、Cloudflare 后台加 `cook.dorianweb.com → http://192.168.1.3:3001` 路由。验收：migrate `Exited(0)`（214 食材/68 菜）、`curl localhost:3001/login` 200、`https://cook.dorianweb.com` 可访问。

### 坑 18：极空间 SSH 账号是重度沙箱
- **现象**：SSH 登录用户名是手机号（如 `18938898409`），`HOME=/home` **只读**、仅 `/tmp` 可写、`docker` 必须 sudo、无免密 sudo（`sudo -n` 失败但带密码 sudo 可用）。
- **影响**：① 没法在 NAS 上 clone+本地 build（沙箱+无持久可写目录）；② 没法配 SSH 公钥免密（`~/.ssh/authorized_keys` 写不进只读 HOME）——所以"AI 用密钥免密接管 NAS"这条路走不通，只能让用户在自己终端里粘命令、贴回输出。
- **解法**：docker 操作一律 `sudo`；持久化数据放大容量数据卷（本机是 `/data_s001`，15T；docker root 在 `/data_s002/.../zdocker`）。项目目录 `sudo mkdir -p /data_s001/cooking-master`。
- **教训**：极空间这类消费级 NAS 的 SSH 是给"贴命令"用的，不是给自动化用的；docker 真正的管理面是它的图形 Docker 应用（child-growth/cloudflared 都是 GUI 建的，镜像走 GHCR + watchtower）。顺着"CI 出镜像、NAS 拉镜像"做最省心。

### 坑 19：极空间终端在 ~90 字符处硬折行，把长命令截断成多条
- **现象**：粘贴较长的单行命令，终端在 ~90 列插入真实换行，折行后的部分被当成新命令执行 → `-s: command not found`、`$VAR: command not found`、heredoc 卡在 `>` 等。`.env` 一度被写成空值。
- **解法**：① 所有命令保持**短行**（<~70 字符）；② 长值（密钥、镜像全名）先塞进**短变量**再引用（如 `M=ghcr.nju.edu.cn/...; sudo docker tag $M:migrate $G:migrate`）；③ 写文件别用多行 heredoc，改用**一行一个 `echo xxx | sudo tee -a .env`**（每行很短）。
- **教训**：远程粘贴命令时永远假设终端会折行；能用变量缩短就缩短，能拆成多条短命令就拆。

### 坑 20：国内拉 Docker Hub / ghcr 镜像超时，要走国内镜像源 + retag
- **现象**：`docker compose up -d` 卡在 `db` 拉 `postgres:16-alpine`（`registry-1.docker.io` `context deadline exceeded`）；ghcr 的 web/migrate 也极慢（migrate 镜像 1.06GB，估 1 小时）。
- **解法**：用国内镜像源拉同一镜像再 `docker tag` 回原名（镜像层按 digest 寻址，retag 后 compose 用本地、不再访问远程）：
  - Docker Hub → `docker.1ms.run/library/postgres:16-alpine` 然后 `docker tag ... postgres:16-alpine`
  - ghcr → `ghcr.nju.edu.cn/yxwu0131/cooking-master:{latest,migrate}` 然后 tag 回 `ghcr.io/...`
  - 实测可达镜像源：`docker.1ms.run`(401)、`dockerpull.org`(401)、`docker.1panel.live`(200)、`ghcr.nju.edu.cn`(南大，教育网快)
- **坑中坑**：`up -d` 默认 pull policy 是 "missing"——**只要本地有同名 tag 就不会去远程**。所以"拉镜像源+retag 回原名"能彻底绕开被墙的官方仓库。
- **教训**：给国内 NAS 部署，凡是 image 引用都要预判官方仓库被墙；先把镜像 retag 到本地再 `up -d`。child-growth 没踩到 postgres 这坑是因为它用 Supabase、无本地 DB 镜像。

### 坑 21：Cloudflare Tunnel public hostname 的 URL 必须带协议前缀
- **现象**：填 `192.168.1.3:3001` 报 `Invalid service URL format (must start with protocol like https://, tcp://, etc.)`。
- **解法**：填 `http://192.168.1.3:3001`（web 是明文 HTTP，TLS 由 Cloudflare 边缘负责）。cloudflared 容器在 NAS 上，用宿主局域网 IP+发布端口即可达到 web 容器。

### 决策 26：migrate 镜像偏大（1.06GB），待优化
- migrate 用的是 `builder` 阶段镜像（含全量 node_modules + .next + 源码），1.06GB，国内首拉很慢。后续可做一个精简 migrator 阶段（只 prisma CLI + tsx + schema + seed.ts + 必要 deps），或把 db push/seed 改成能在 slim web 镜像里跑（编译 seed 为 JS）。本次先用大镜像跑通，不阻塞上线。

### 坑 22：Windows 动态端口范围把 5432 抢走，Docker 永远绑不上该端口（坑 11 的真正根因）
- **现象（2026-05-22）**：开机后本地网页打不开。Docker Desktop 守护进程没自启；拉起后 DB 容器能跑、容器内 `pg_isready` 正常，但 `docker inspect .NetworkSettings.Ports` 始终 `{"5432/tcp":[]}`，host `127.0.0.1:5432` 连不上。**坑 11 的所有套路（restart、stop+start、删容器重建、杀进程重启 Docker、`wsl --shutdown` 重置 WSL2 后端）这次全部无效**。
- **隔离定位**：用一次性 nginx 容器测端口发布——`-p 18080:80` **成功**（`0.0.0.0:18080->80`），`-p 5432:80` **失败**（`{}`）。证明 Docker 端口转发本身没坏，**问题特定于 5432 这个端口号**。
- **根因**：`netsh int ipv4 show dynamicportrange tcp` 显示动态端口范围被设成 **起始 1024、共 13977 个（即 1024–14999）**（正常 Windows 默认是 49152 起）。**5432 落在这个区间内**，会被 Hyper-V/WSL 的 NAT 临时预留抢占（这类预留不稳定地出现在 `excludedportrange` 里，但足以让 Docker 静默绑定失败——`NetworkSettings.Ports` 直接空）。"昨天能用今天不能用"就是因为每次重启 Hyper-V 重新分配，有时抢到 5432 有时没抢到。
- **解法（不需要管理员、可逆）**：把 DB 容器映射到**范围外**的 host 端口（本次用 **55432**），同步改 `.env` 的 `DATABASE_URL` 端口为 55432（容器内仍是 5432，只改主机映射）：
  ```
  docker run -d --name cooking-master-db -p 55432:5432 \
    -e POSTGRES_USER=cooking -e POSTGRES_PASSWORD=cooking_dev -e POSTGRES_DB=cooking_master \
    -v <原匿名卷hash>:/var/lib/postgresql/data postgres:16-alpine
  ```
  数据卷独立（重建容器不丢数据，日志会显示 `database system was shut down ... ready`）。改完 host `55432` 立即可连，dishes 页（查库）返回 200。
- **根治选项（需管理员，本次没做）**：① `netsh int ipv4 set dynamicport tcp start=49152 num=16384` 把动态范围改回正常值，5432 就不会被抢；② 或 `netsh int ipv4 add excludedportrange protocol=tcp startport=5432 numberofports=1` 显式保留 5432 给 Docker。当前 shell 非 elevated（`net start winnat` 报 Access denied），所以走了改端口的旁路。
- **教训**：遇到"docker exec 能连、host 端口连不上、`NetworkSettings.Ports` 为空"且 restart/重建/wsl shutdown 都无效时，**先 `docker run -p <某高位端口>:80 nginx` 隔离是不是端口号本身的问题**，再 `netsh int ipv4 show dynamicportrange tcp` 看目标端口是否落在动态范围内。低位端口（<49152）在 Windows+Docker+Hyper-V 下不可靠，本地服务尽量用高位端口映射。这是坑 11"端口绑定丢失"的真正根因，坑 11 之前 stop+start 偶尔生效只是恰好那次 Hyper-V 没抢 5432。

### 坑 23：DeepSeek 把"适量/少许"塞进数字字段，菜谱 schema 校验失败（AI入库报"格式不对"）
- **现象（2026-05-22）**：灵感库新菜点「AI入库」报"AI返回的菜品格式不对"（`wishToDish` 的 `wishToDishOutputSchema.safeParse` 失败）。
- **根因**：中餐调料 DeepSeek 极常返回 `"quantity":"适量"/"少许"` 等中文字符串，而 `recipeGenerateOutputSchema` 里 `quantity` 是 `z.number()`，整条校验直接挂；`stepType` 偶尔也返回枚举外的中文（如"翻炒"）。
- **解法**：`lib/ai/types.ts` 加 `flexNum(fallback)`（`z.preprocess`：数字直用、字符串抽数值、抽不到给兜底）应用到所有数字字段（quantity/totalMinutes/durationMinutes/order/difficulty）；`difficulty` 再 transform 钳到 1-5；`stepType` 用 `.catch("PREP")` 兜底。valid 数字原样通过，零风险。修 base schema 同时修好普通菜谱生成。
- **教训**：对接 LLM 的结构化输出，数字字段一律宽松解析，别用裸 `z.number()`，尤其中文量词场景。

### 决策 27：午餐却显示 18:30 开饭——开饭时间随餐次走
- `components/cook/create-session-form.tsx` 原 `defaultTargetTime()` 写死 18:30，且切换餐次不更新时间。改：加 `MEAL_DEFAULT_HOUR`（早 7:30/午 12:00/晚 18:30/加餐 15:00），初始按餐次取默认；切换餐次时 `withMealHour` 保留已选日期、只把时间挪到该餐次典型点。
- 注意：已生成的旧 session 的 targetTime 不会变，用户可在表单里手动改时间。

### 决策 28：做饭时间线模块一/二改为「按食材横向合并」而非按单菜罗列
- **背景**：用户反馈 6 模块仍是"单菜流程套了个模块壳"。根因在 `lib/planning/cooking-plan.ts`——步骤逐道菜原样取出只做时间调度，UI(`classifyStepToModule`) 只是二次分桶，没有跨菜按食材统筹。
- **方案（hybrid：规则骨架 + AI 一句话）**：
  - 新增 `lib/planning/prep-consolidation.ts:buildPrepPlan(dishes, catalog)`：规则化生成跨菜备菜清单——RICE(主食先煮)/SOAK(干货泡发)/MARINATE(集中腌制)归模块1，WASH_CUT(按 canonical 食材聚合洗切，复用 shopping-list 的别名归一化)/BLANCH(焯水批次)归模块2。
  - `lib/ai/deepseek.ts:consolidatePrepHint(dishNames)`：best-effort 出一段"统筹备菜建议"人话，失败返回 null 不阻断。
  - `cooking-plan.ts` 生成计划时 build prepPlan + 调 AI hint，存到新字段 `CookingPlan.prepPlan Json?`。
  - UI `session-workspace.tsx:TimelineView`：模块1/2 有 prepPlan 时渲染"按食材"清单（食材→总量→分给哪几道菜的 Badge），模块3-6 保持按菜步骤；旧计划 prepPlan 为 null 时回退原渲染。
- **要看到新效果需重新生成做饭计划**（旧计划无 prepPlan）。

---

## 2026-05-26 本批改动 dev 点测（浏览器全流程）+ 两个 LLM 输出兼容坑

> 用 CDP 浏览器走完整流程验证 2026-05-24 那批改动（时间线两阶段 / 漏菜兜底 / 牛肉焖饭不重复煮饭 / 库存手动加食材），过程中又揪出两个会阻断核心流程的 LLM 输出兼容坑（坑23 同源、未覆盖到的字段）。

### 验证结论（4 项改动全过）
- **时间线两阶段**：「①备菜·统一准备（统筹建议 + 按 canonical 食材横向合并洗切，如「大蒜 共5瓣 → 青椒土豆丝2瓣 / 醋溜白菜3瓣」）→ ②烹饪·按下锅顺序（饭/炖/蒸先开，叶菜/汤压轴）」渲染正确；每道菜「查看完整菜谱」可展开食材/调料/分步做法/火候厨具。✓
- **漏菜兜底**：骨架菜（无菜谱）仍出现在时间线，显示合成步骤「制作「X」（菜谱待补全…）」。✓
- **牛肉焖饭不重复煮饭**：AI 推荐里含牛肉焖饭的方案没有再被补一份白米饭（仅无主食的方案才补）。✓
- **库存手动加食材**：搜不到的食材出现「库里没有「霸王龙肉」？手动添加它」入口，点添加后自动归类（含"肉"→肉类/冷藏）并入库。✓

### 坑 24：`missingIngredients.quantity` 是字符串（"半"）致 recommendMenu 整条 schema 校验失败 → 推荐流程全崩
- **现象（2026-05-26）**：点「AI 推荐菜单」必报「AI 推荐失败」。dev log：`[ai.recommendMenu] schema 校验失败`，path 全是 `plans.N.dishes.M.missingIngredients.K.quantity`，`expected number, received string`。raw 里见 `{"name":"洋葱","quantity":"半","unit":"个"}`。
- **根因**：坑 23 的 `flexNum` 当时只补到了菜谱生成 schema（recipe ingredients/seasonings quantity），**没覆盖到推荐 schema 的 `menuPlanSchema.dishes[].missingIngredients[].quantity`**，那里仍是裸 `z.number()`。DeepSeek 给缺料的量常返回"半/适量/少许"等中文。
- **解法**：把 `flexNum` 定义上移到 `menuPlanSchema` 之前（它是 `const` 箭头函数、不会被 hoist，原来定义在 recipe schema 那段、在 menuPlanSchema 之后用不了），`missingIngredients.quantity` 改用 `flexNum()`。`menuRecommendInputSchema` 的 inventory.quantity 不用改（那是我们自己从 DB 构造的，恒为数字）。
- **教训**：对接 LLM 的**所有**结构化输出里的数字字段都要 flexNum，别只补一处；加新 schema/新数字字段时默认就用 flexNum。

### 坑 25：菜谱步骤 `heat/cookware` 被 DeepSeek 显式返回 `null`（而非省略）致 generateRecipe 校验失败 → 骨架菜首次补菜谱必崩
- **现象（2026-05-26）**：确认含骨架菜（如「牛肉焖饭」）的菜单时，`[ensureRecipes] 生成「牛肉焖饭」菜谱失败: AI 返回的菜谱格式不正确`；issues 全是 `steps.N.heat` / `steps.N.cookware`：`expected string, received null`。（该菜走漏菜兜底仍出现在时间线，但没有真菜谱。）
- **根因**：`recipeGenerateOutputSchema` 里 step 的 `heat`/`cookware`/`parallel`/`dependsOn` 是 `.optional()`（容忍 undefined）但**不容忍 null**；DeepSeek 对没有火候/厨具的步骤（如电饭煲焖饭）会显式给 `null` 而不是省略字段。
- **解法**：这四个字段改 `.nullish()`（= optional + nullable）。下游消费处（cooking-plan.ts 的 `?? ""`/`?? null`、PlannedStep 内部转换给 `dependsOn` 兜底 `[]`）已能吃 null，tsc 通过。修后重跑：「牛肉焖饭」成功补出完整菜谱（牛腩300g/大米250g + 分步火候），时间线不再显示"菜谱待补全"。
- **教训**：LLM 的可选字段要用 `.nullish()` 不是 `.optional()`——模型经常把"无值"表达成显式 `null`。这与坑 23/坑 24 是同一类「LLM 输出宽松解析」问题。

### 备注：非阻断观察（留待 UI 美化阶段）
- 采购"需买"里把"适量/少许"解析成 `0`（flexNum 兜底），显示成「盐 0」略丑——可在 UI 层把数量为 0 的调料显示成"适量"。
- 时间线顶部说明文案有处仍写「【三阶段】先切配→…」，但实际渲染就是两个模块（备菜+烹饪），属文案口径未对齐，非结构问题。
- 本地点测在 `测试家`（test@cooking.local）这个一次性账号下进行；为登录临时把它的密码设为已知值（仅本地 DB）。点测产生的 2 个 session + 给骨架菜补的菜谱都留在本地库，无害。

---

## 2026-05-27 安卓 APK（Capacitor WebView 壳）

> 把线上站点 `cook.dorianweb.com` 包成安卓 APK。选 **Capacitor WebView 壳** 而非 TWA：内容全走线上（更新零成本），日后可加原生插件（推送/相机/分享）。工程放隔离的 `mobile/` 子目录（自带 npm package.json，不碰主 app 的 pnpm 依赖树）。本批构建出 3.9MB debug APK，跑通。

### 决策 29：安卓壳用 Capacitor，工程隔离在 `mobile/`，`android/` 不入库
- **结构**：`mobile/{package.json,capacitor.config.ts,www/index.html,README.md}` 为版本库里的「真源」；`mobile/android/`（cap add android 生成的 Gradle 工程）**整目录 gitignore**——它 100% 由 `capacitor.config.ts` 生成、当前零手改，随时可 `npx cap add android` 重建。`mobile/` 也加进 `.dockerignore`（不进 web 镜像）。
- **配置**：`appId=com.dorianweb.cooking`、`appName=厨神`、`server.url=https://cook.dorianweb.com`（Cloudflare 托管 HTTPS，`cleartext:false`）。`www/index.html` 只是加载/离线兜底页。
- **为何用 npm 不用 pnpm**：mobile 是独立子项目，npm 装 Capacitor 无 pnpm 11 的 build-script 审批坑（坑3/16），最省事；`pnpm-workspace.yaml` 无 `packages:` glob，不会把 mobile 当 workspace 吞进去。
- **重建+构建步骤**：见 `mobile/README.md`（含完整 env 变量 + 命令）。

### 坑 29：Capacitor 7 强制 JDK 21，用 JDK 17 构建报「无效的源发行版：21」
- **现象**：`gradlew assembleDebug` 在 `:capacitor-android:compileDebugJavaWithJavac` 失败：`错误: 无效的源发行版：21`（invalid source release: 21）。本机原只有 Adoptium **JDK 17**。
- **根因**：Capacitor 7 的 android library 用 Java 21 source/target 编译，javac 17 编不了 source level 21。Capacitor 7（2025 初）起强制 JDK 21。
- **解法**：装 Temurin **JDK 21**（zip 免管理员，解压到 `C:\Java\jdk-21.0.11+10`），构建前 `$env:JAVA_HOME` 指它。重跑 `assembleDebug` 2m46s BUILD SUCCESSFUL。Adoptium 直链：`https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse`。
- **教训**：Capacitor 7 = JDK 21 起步。装新 major 的 Capacitor 先确认 JDK 版本要求。

### 坑 30：headless 装 Android SDK——sdkmanager 许可/装包要用 Start-Process 重定向 stdin 喂 y
- **背景**：无 Android Studio，只装 cmdline-tools（sdkmanager）headless 装 SDK。`%LOCALAPPDATA%\Android\Sdk\cmdline-tools\latest\`（注意必须是 `latest` 子目录，否则 sdkmanager 报 location 错）。
- **现象**：PowerShell 里 `"y`n..." | & sdkmanager.bat --licenses` **喂不进去**——.bat 转调 java 读 stdin，管道 y 被忽略，仍停在「Review licenses (y/N)?」。
- **解法**：写一个 50 行 `y` 的文件，用 `Start-Process -RedirectStandardInput $yfile -RedirectStandardOutput ... -Wait`。许可全 accept（exit 0），再同样方式 `sdkmanager platform-tools "platforms;android-35" "build-tools;35.0.0"`。Capacitor 7 需 compileSdk/targetSdk **35**、build-tools **35.0.0**、minSdk 23（见 `mobile/android/variables.gradle`）。
- **教训**：Windows 上给 native .bat/exe 喂交互输入，PowerShell 管道常失效，用 `Start-Process -RedirectStandardInput <file>` 最稳（NOTES 多处「喂 y」场景通用）。

### 决策 30：先出 debug APK，图标/启动图/release 签名留待 UI 美化阶段
- debug APK（`mobile/android/app/build/outputs/apk/debug/app-debug.apk`，约 4MB）用 debug keystore 自签，可直接侧载家人手机（开「允许未知来源」）。已复制一份到 `mobile/厨神-debug.apk`。
- **待办**：① App 图标+启动图还是 Capacitor 默认——放张源图用 `npx @capacitor/assets generate --android` 一键生成各密度再重 build；② 长期分发建 release keystore 出签名包。两项都并入 UI 美化阶段。
- **未做**：APK 未在真机实测（无设备）；需用户装一次确认能开、能登录、WebView 正常。

### 坑 31：移动端底部导航被顶到屏幕最上方——`backdrop-filter` 祖先成了 `fixed` 子元素的包含块
- **现象**：家人装 APK 后反馈「顶部的标签太高、顶到屏幕顶部、不好按」。实测手机视口下，本该 `fixed bottom-0` 钉在屏幕底部的 5 格移动端导航，`getBoundingClientRect()` 是 `top=3 bottom=64`——整条贴在屏幕最上方、压着状态栏。
- **根因**：该 `<nav fixed bottom-0>` 嵌在 `<header>` 里，而 header 带 `backdrop-blur-md`（=`backdrop-filter`）。**CSS 规范：祖先一旦有 `filter`/`backdrop-filter`/`transform`/`perspective` 等，就会成为后代 `position:fixed` 的包含块**（不再相对视口）。于是 `bottom-0` 是相对仅 65px 高的 header 底边定位 → 导航被顶到屏幕顶部。在桌面端因 `md:hidden` 该 nav 不显示，所以一直没暴露。
- **解法**：把移动端底部 `<nav>` 移出 `<header>`，作为兄弟节点（组件 return 用 `<>…</>` 包 header + nav）。移出后 `fixed bottom-0` 相对视口定位，`rect` 回到 `top=783 bottom=844`（844 视口），正确钉底。改 `components/app-nav.tsx`。
- **顺带**：viewport 加 `viewportFit:"cover"`（`app/layout.tsx`）+ header 加 `pt-[env(safe-area-inset-top)]`，让 Android 15（SDK35）edge-to-edge 下顶栏避开状态栏/刘海；底栏原有的 `pb-[env(safe-area-inset-bottom)]` 这次才真正生效（之前没 cover，env() 恒为 0）。
- **教训**：凡 `fixed` 元素位置不对，先查它**所有祖先**有没有 `transform/filter/backdrop-filter/will-change/contain:layout|paint|strict`——任一都会劫持 fixed 的定位基准。毛玻璃顶栏 + 内嵌 fixed 底栏是高频组合陷阱。

### 决策 31：菜品成品图功能（本地存储 + Bing 抓图 + 按名哈希，便于上 prod）
- **目标**：App 主流化——点菜/菜单/详情有成品图更直观。`Dish.imageUrl`（schema 早留）启用。
- **存储**：本地卷，不用 Supabase（实际没配 + supabase.co 国内手机加载不稳）。`IMAGES_DIR=./data/images`，新增服务路由 `app/api/img/[...path]/route.ts`（防穿越 + 缓存头），走 cloudflared 隧道。prod compose **早已备好** `IMAGES_DIR=/app/data/images` + 卷 `./data/images:/app/data/images`。
- **来源**：`scripts/fetch-dish-images.ts` 抓 Bing 图片（查询词 `{name} 美食`，不要用 `成品`——会带出海报/风景等非食物图）。`fetchImage` 只收 jpeg/png/webp、6KB–6MB。
- **关键：文件名按【菜名 sha1 前16位】命名，不用 cuid**——dish.name 是 @unique 跨库稳定，而 cuid 各库不同。这样本地抓的图能直接搬 prod。imageUrl 形如 `/api/img/dish/<sha1>.jpg`。
- **渲染**：`components/dish-image.tsx`（有图显图、无图/onError 降级菜系 emoji）。已接入：菜品库列表缩略图、菜品详情大图 banner、做饭确认页菜品卡片网格、菜单编辑/点菜选择器缩略图。
- **上 prod 步骤**（部署时）：① 推代码；② 把本地 `data/images/dish/*` 拷到 NAS 同路径（卷已挂）；③ 对 prod 库跑 `--relink`（不联网，按菜名 sha1 匹配磁盘文件、写回 imageUrl）：`node --env-file=.env ...tsx... scripts/fetch-dish-images.ts --relink`。
- **已知**：自动首图约 5/300 抓不到（降级 emoji），且部分图不够准（家人以后可实拍覆盖，覆盖功能未做）。sharp 非本项目直接依赖（Next 自带），脚本不重编码，交付由 next/image 优化。

### 坑 32：图片文件名若用 cuid 则无法搬到 prod（dish ID 跨库不一致）
- 本地 dev 库与 prod 库各自 seed，`Dish.id`(cuid) 不同；若 imageUrl 用 `/api/img/dish/<cuid>.jpg`，把图和 DB 值搬到 prod 会全部对不上。
- 解法：文件名用**菜名的 sha1**（name 是 @unique，跨库稳定）。配 `--relink` 模式，部署后对 prod 库按名重连 imageUrl。第一版误用了 cuid，已重构 + 清库重抓。

### 本批顺手清的两个非阻断观察（UI）
- 采购清单 + 推荐「需买」里 quantity=0 的调料：`session-workspace.tsx` 两处由「盐 0」改判 `quantity>0 ? \`${q} ${unit}\` : "适量"`。tsc 过。
- 「三阶段」文案观察：全仓 grep 无「三阶段/先切配」残留——早在时间线两阶段重构时已清除，无需再改。

---

## 2026-05-28 体验反馈两轮：图片回退 emoji + 重复菜清理 + 骨架菜按需 AI 补谱

### 坑 33：Bing 抓的菜品成品图质量参差，用户体感「有点可怕」→ 整体回退到 emoji 卡通头像
- **现象**：决策31上线后家人体感反馈「图片有点可怕」。抽样查的确：歧义菜名抓到海报/水印图（红烧肉=会议截图、虾系列误中海鲜店招牌）、湿菜/汤类经常拍得近镜糊脸、~60% 命中率内还混了不少非家常呈现，整体不如原来的菜系 emoji 头像（决策23）让人有食欲。
- **解法（不丢资产）**：① `UPDATE Dish SET imageUrl = NULL`（all 312 道）→ `DishImage` 已有降级逻辑，自动回退到 `dishEmoji(cuisine, isSoup, isVegetarian)` 卡通色块。② 物理图片 `data/images/dish/*`（311 张）**保留**，便于以后再尝试。③ 抓图脚本/路由/选图后台页 `/dishes/images`/`DishImage` 组件**全部留着不删**，下次重启用只需重新抓+`--relink`。
- **未来再做**：如果再上图，先解决质量门槛——人工挑+实拍优先（用 `/dishes/images` 后台一张张过），自动抓只做兜底；或换图源（小红书/下厨房的菜品 API，需调研）。低质量自动图不如 emoji。
- **教训**：「图片功能」≠「图片质量」。Bing 图搜对菜名歧义+防盗链+艺术化呈现的鲁棒性远不够当产品图源。下次上图前先抽样 30 张盲评通过再大规模抓。

#### 2026-05-31 补：30 张盲评做了，命中率 6.7%，且混进一张 NSFW —— 结论硬化为「不可用，建议删库」
- **做法**：对 `data/images/dish/`（311 张）按 sha1 文件名反解菜名（用 seed.ts 全部 name 算 sha1[:16] 反查，305/311 解出），等距抽 30 张，用 **Read 工具逐张渲染**（本环境 CDP screenshot 失效但 Read 能直接看图）人工评「是否该菜的、可上架质量的成品图」。
- **结果**：**仅 2/30 ≈ 6.7%** 是对的菜的成品图（韭菜盒子、包子），且**两张都带图库水印**（nipic/699pic）→ 干净可上架的实际 **0/30**。门槛是 >85%，惨败，远比坑33 当时估的「~60%」还差（那个估计太乐观，或这批是改进查询前的旧图）。
- **错图分布**：6 张是**生食材**而非成品（土豆/葱/莴笋/酱油/蒜×2 —— 菜名含食材词就抓了原料）；~21 张完全无关（棒球赛/半导体工艺图/概念车/油画/毛泽东/达赖/潜水器宣传海报/游戏聚合页/洗衣机/公寓楼/电影 credits/书法「白」字…）；**1 张 NSFW（清炒虾仁 → 沙滩裸女）**。
- 🚨 **安全隐患**：NSFW 那张当前不被引用（imageUrl 全 NULL），但**留在磁盘上**，谁要在 dev 或 **prod** 跑 `--relink` 就会把它（及一堆垃圾图）当成品图喂给家人。坑33 说「图保留便于以后再尝试」的前提（图是资产）被推翻——这批自动抓的图是**负资产**，88MB 里 93% 垃圾 + 含 NSFW。
- **处理（2026-05-31 用户拍板「整个删掉」已执行）**：① `rm -rf data/images/dish`（311 张 88MB）+ `data/images/_cand`（候选缓存 1.2MB）全删，`data/images/` 现为空。本地操作，`data/` 是 gitignore、不在 prod，零仓库/生产影响。② **基础设施保留**（抓图脚本 `scripts/fetch-dish-images.ts`/`/api/img` 路由/`/dishes/images` 选图后台页/`DishImage` 组件 + emoji 降级）——将来上图只能走**人工挑选 / 实拍 / 正经食材 API**，绝不能再用 Bing 自动抓当图源。③ 抓图脚本若将来重启用，应加：拒绝带常见图库水印域名、菜名含纯食材词时跳过、NSFW 过滤——但 ROI 低，不如直接人工。
- **教训**：自动图搜当产品图源对中文菜名是**根本性不可行**（歧义 + 防盗链水印 + NSFW 泄漏 + 抓到原料/字形/同名实体）。这类「内容质量」需求别指望通用搜索兜底；要么人工，要么垂直食谱 API。盲评用 Read 工具看图这条**在本环境可行且高效**（30 张分 3 批读完即出结论）。

### 决策 32：骨架菜「按需补菜谱」+ 后台批量补一次性兜底
- **痛点**：扩库的 238 道骨架菜（`DISH_SKELETONS`，决策22）原本只有元数据无菜谱，靠确认菜单时 `ensure-recipes.ts` 触发 AI 补。**后果**：用户在菜品库点详情，点到骨架菜只看到「这道菜还没有做法」，体验破。
- **解法**：① 详情页 `dish-recipe-view.tsx` 空状态加「让 AI 生成做法」按钮（暖色渐变卡 + Sparkles 主按钮 + 手动添加 outline 按钮），新增 server action `generateDishRecipeAction(dishId)` 复用 `ensure-recipes.ts` 同款 AI 调用路径。② 一次性兜底脚本 `scripts/bulk-fill-recipes.ts`：扫描 `recipe: null` 的菜 → 逐道调 `generateRecipe` → 写回 `prisma.dish.update + recipe.create`，失败跳过不阻塞、输出到 `data/bulk-fill-progress.log` 看板（每行：`[N/total] 菜名 ... ok 9.3s`）。
- **批量补成本**：deepseek-chat ~9s/道 × 242 道 ≈ 40 分钟单线程跑完，token 总费用 < $1。完成后用户「灵感库新菜」走原有 `parseWishToDishAction`（决策19），不再需要兜底；新加的菜如果走骨架途径，详情页按钮兜底。
- **数据一致性**：脚本写时不传 `availableSeasonings`/口味 flags（全库共享 Dish.recipe，不该按某个家庭口味偏置），用通用家常思路出。后续家庭确认菜单时 `ensure-recipes.ts` 仍按家庭口味二次定制只发生在「该菜原本没菜谱」的情况，本次跑完后 ensure-recipes 几乎不再触发，省钱。

### 决策 33：菜品重复清理（按"换部位/换主食=同一道菜"准则）
- **触发**：用户体感看到「2 个可乐鸡翅」（实为 可乐鸡翅 + 可乐鸡腿，schema @unique 不可能真同名）。明确准则：**原材料换部位 / 同菜+主食盖饭 = 同一道菜**，要合并。
- **筛查脚本一次性**：用 `Dish.findMany` + 双层循环按子串+长度差≤2 找近似名，得 10 对候选，按准则人工裁决：
  - **同一道菜（删后者）**：可乐鸡腿、蚝油生菜心、口水鸡丝、麻婆豆腐盖饭、宫保鸡丁盖饭、黄焖鸡米饭
  - **不同菜（保留）**：笋干红烧肉 vs 红烧肉（加主料）、咸肉冬瓜汤 vs 冬瓜汤（加咸肉）、日式咖喱鸡 vs 咖喱鸡（菜系不同）、腊味煲仔饭 vs 煲仔饭（加腊味）、蒜苗回锅肉 vs 回锅肉（加蒜苗）
- **删除路径**：FK 注意 `FamilyDish.dishId`/`MenuDish.dishId`/`Wish.parsedDishId`/`Feedback.dishId`。schema 里这些都是简单 onDelete=NoAction，**先 reassign 引用到保留菜（如果用户已 LOVED 可乐鸡腿）再 delete**。本次 dev 库无引用，直接 delete 6 条。
- **教训**：seed 扩库（决策22）批量添加时没做近似检测，单纯依赖 `@unique` 防同名是不够的；下次扩库前应该跑一遍"按主料+做法"的去重器。也可以考虑给 Dish 加 canonical_key 字段（去掉「米饭」「盖饭」「丝」后缀+部位归一）。

---

## 2026-05-30 App 图标 + 启动图（Capacitor 自适应图标）

### 决策 34：App 图标/启动图复用品牌 logo（白色 ChefHat + 番茄橙），SVG→sharp→@capacitor/assets
- **设计**：直接复刻 app-nav 的 logo 徽章（白色 lucide ChefHat 描边 + 番茄橙圆角方），不另造设计——保持品牌一致。主色 `--primary oklch(0.65 0.18 42) ≈ #E56022`，图标用渐变 `#F2864A→#D9531F`；启动图浅色底 `#FCF9F2`（= `--background` 奶油）、深色底 `#241D18`（= 暗色 `--background`）。
- **源文件管线**（入库在 `mobile/assets/`）：`gen-icon-sources.cjs` 用**主项目的 sharp**（mobile 子项目没装 sharp，require `../../node_modules/.pnpm/sharp@<v>/...`）把内联 SVG 光栅化成 `logo.png`(1024² 完整图标) + `icon-foreground.png`(1024² 透明白帽)。再 `npx @capacitor/assets generate --android --iconBackgroundColor #E56022 ... --splashBackgroundColor #FCF9F2 --splashBackgroundColorDark #241D18` 出 92 个密度产物。
- **为何不用 SVG 直接喂 @capacitor/assets**：该工具要 PNG 源（≥1024²），不吃 SVG；自己用 sharp 先栅格化。oklch 颜色 librsvg/resvg 不认，SVG 里一律用 hex。
- **帽尺寸调参**：前景 SVG 用 `scale(40)`（帽高约画布 70%），叠加 adaptive-icon 的 16.7% inset 后可见帽约 60%，符合标准自适应图标观感。第一版用 scale(30) 偏小，调大到与 logo 一致。
- **验证**：用 Read 工具直接看生成的 PNG（本环境 CDP screenshot 失效但 Read 能渲染图片）——legacy `ic_launcher.png`、圆形遮罩模拟、浅/深启动图四类均 OK。`assembleDebug` 28s 成功，APK 4.7MB（比无图标的 3.9MB 大）。**未真机实测图标**（无设备）。
- 产物 `mobile/android/`、`*.apk` 都 gitignore；入库的是 `mobile/assets/{logo.png,icon-foreground.png,gen-icon-sources.cjs}`，重建后照 README 重跑生成 + 坑34 修正。

### 坑 34：@capacitor/assets 给纯色背景套 16.7% inset，自适应图标圆形遮罩下四角透明
- **现象**：`@capacitor/assets generate --android --iconBackgroundColor #E56022` 生成的 `mipmap-anydpi-v26/ic_launcher.xml` 把**背景**也包进 `<inset android:drawable="@mipmap/ic_launcher_background" android:inset="16.7%" />`。背景 PNG 本是全幅纯橙方块（432px=108dp），被 inset 16.7% 后只占内圈 66%（≈72dp），外圈一圈透明。
- **影响**：自适应图标的背景层本应**全幅铺满**（外圈区域是给各家启动器遮罩/视差用的）。背景被 inset 后，启动器用圆形/squircle 遮罩（可超出 72dp 安全区）渲染时，图标四角/边缘会露出透明 → 桌面上看到缺角的橙圆。前景该 inset（缩进安全区），背景不该。
- **解法**：把两个 `ic_launcher.xml` / `ic_launcher_round.xml` 的 `<background>` 改回纯色全幅（去 inset）：`<background android:drawable="@mipmap/ic_launcher_background" />`。前景的 16.7% inset 保留。改完模拟圆形遮罩（sharp 合成 bg+前景 inset 后 dest-in 圆形 mask）确认四角满橙、无透明。
- **注意**：`mobile/android/` 整目录 gitignore，这个修正每次 `npx cap add android` + `@capacitor/assets generate` 重建后都要重做（已写进 `mobile/assets/gen-icon-sources.cjs` 头注释 step 3 + README）。
- **教训**：@capacitor/assets 的自适应图标默认模板对纯色背景套 inset 是个坑；凡用纯色/全幅背景，生成后检查 adaptive-icon xml 的 `<background>` 有没有被 inset，有就去掉。跨项目通用（任何 Capacitor/Android 自适应图标）。

---

## 2026-05-31 推 main 前深度评测 + 5 项硬化修复

### 决策 35：推 main 前用多 agent 工作流做了一轮深度评测，按结论修了 5 类问题
- **评测方式**：8 维度并行审查（安全/规划正确性/未提交UI/AI健壮性/数据性能/schema/UX/技术债）+ 每条发现派对抗式 skeptic 复核（57 agent，46 确认/3 证伪），主线程再亲自 ground-truth 关键项。报告全文见会话；要点：工程质量扎实，**唯一推送前阻塞项 = 本次新增的实时 Bing 抓图后台页**（SSRF + NSFW，公网可达）。
- **顺带 ground-truth 出一条根因放大器**：`auth.ts:registerAction` 的 mode 只看表单有没有 inviteCode——**无邀请码即建新家庭 + role:ADMIN + 自动登录**，且 `/register` 不在 `auth.config.ts` 保护列表、站点公网域 → **任何网友可自助注册成 ADMIN**（prod 现存行为，非本次引入）。这推翻了多条复核「只有 5 个可信家人」的降级前提。
- **本次落地的 5 项修复**（tsc 全过）：
  1. **下线实时抓图入口**：删 `app/(app)/dishes/page.tsx` 的「配图」链接 + 连带 Button/Link/ImagePlus import；`getDishImageCandidatesAction` 加 `ENABLE_DISH_IMAGE_FETCH!=="1"` 开关（默认关，返回「自动抓图已停用，请改用上传照片」）。`uploadDishImageAction`（人工上传，有类型/大小校验）不受影响。
  2. **堵开放注册**：`registerAction` 对 `mode:"new"` 加 `ALLOW_OPEN_REGISTRATION!=="1"` 闸（默认关，返回「自助创建家庭已关闭，请用邀请码加入」）。邀请码加入路径不受影响。
  3. **AI 默认模型**：`deepseek.ts` 兜底 `deepseek-v4-pro`→`deepseek-chat`；`.env.example` 同步改 + 新增两个开关变量注释。
  4. **去重**：从 `seed.ts` DISH_SKELETONS 删 6 道重复菜（可乐鸡腿/蚝油生菜心/口水鸡丝/麻婆豆腐盖饭/宫保鸡丁盖饭/黄焖鸡米饭）——seed 不再 upsert 复活；保留菜（可乐鸡翅/蚝油生菜/口水鸡/麻婆豆腐/宫保鸡丁/黄焖鸡）原样在。
  5. **顺手 5 小修**：① AI 菜单 MenuDish 落库补 `servings: eaterAdults+eaterKids`（原恒为默认 2，采购/备菜量与人数脱节）；② `menuPlanSchema.estimatedMinutes/difficulty` 改 flexNum（历史「适量/越界」坑同类，LIVE 推荐路径）；③ `finishCookingAction` 加 `status==="COOKING"` 状态机校验（防重复完成致 cookCount 重复 +1）；④ ~~`updateDishRecipeAction` 限 ADMIN~~ → 评估后**撤销**：自助注册已默认关闭，家庭成员均可编辑做法（保持决策20「人人可编辑」语义）；菜谱写操作仍只对已登录家庭成员开放；⑤ 抽 `lib/ai/error-message.ts` 共用 `mapAIErrorToChinese`，`parseWishToDish`/`generateDishRecipe` 的 catch 不再把原始 Error.message 弹给用户。
- **新增环境开关**（两者默认关 = 安全；公网部署保持关）：`ALLOW_OPEN_REGISTRATION`（=1 才允许自助建家庭，仅本地引导首个家庭用）、`ENABLE_DISH_IMAGE_FETCH`（=1 才启用换图实时抓图）。
- **上 prod 注意**：seed 已不含那 6 道，但 **prod 库存量仍在**，需部署后对这 6 个 name 跑一次 `deleteMany`（有 FamilyDish/MenuDish/Wish/Feedback 引用则先 reassign 到保留菜；prod 多半无引用可直接删）才彻底清掉，删完不会被 seed 复活。
- **未做（评测里确认存在、低优先，记账）**：AI 调用零重试、`Dish.canonicalKey` 去重字段、`MenuDish.dish` 缺 onDelete、采购常备调料别名归一、蒸锅占灶漏报、emoji 降级缺 sr-only、两处缺索引、UX/a11y 维度（工作流里那个 review agent 卡 schema 重试没跑完，仅做了图片那条快查）。详见会话报告。

