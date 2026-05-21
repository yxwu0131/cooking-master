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

