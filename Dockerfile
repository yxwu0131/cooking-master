# 厨神 · 多阶段 Docker 构建
# 阶段 1: 依赖安装
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# 启用 corepack 拿到 pnpm
RUN corepack enable && corepack prepare pnpm@11.1.2 --activate

# 注意：不复制 .npmrc —— 本地 .npmrc 写死了 Windows store-dir 路径，进 Linux 容器会让 pnpm install 崩
# peer 依赖设置用 pnpm 默认（auto-install-peers=true / strict-peer-dependencies=false），--frozen-lockfile 不受影响
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# pnpm 11 默认拦截依赖 build 脚本并以 ERR_PNPM_IGNORED_BUILDS 退出 1，且会在创建顶层 node_modules
# 软链之前就中止（导致 node_modules 残缺）。用 --ignore-scripts 让 install 干净完成链接（exit 0），
# 再显式 pnpm rebuild 把需要原生构建的包（prisma 引擎 / esbuild / sharp 等）真正编译出来。
RUN pnpm install --frozen-lockfile --ignore-scripts && \
    pnpm rebuild @prisma/client @prisma/engines prisma esbuild sharp unrs-resolver

# 阶段 2: 构建
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.1.2 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 生成 Prisma client —— 直接调 .bin（绕开 `pnpm exec` 触发的 deps-status-check，
# 那个 check 会重跑 pnpm install 再次撞上 build 脚本拦截，见坑 5/16）
RUN node_modules/.bin/prisma generate

ENV NEXT_TELEMETRY_DISABLED=1
# 构建期占位 DATABASE_URL（next build 不会真连库；运行时由 compose 注入覆盖）
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"
# 同理直接调 next 入口，避免 `pnpm build` 触发 deps-status-check
RUN node_modules/.bin/next build

# 阶段 3: 运行时（最小镜像）
FROM node:22-alpine AS runner
RUN apk add --no-cache openssl tini
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# 复制 next.js standalone 输出
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prisma：Next standalone 已 trace @prisma/client 包，但 pnpm 布局下「生成的 client + 查询引擎」
# 在 .pnpm/@prisma+client@.../node_modules/.prisma 里、没被 trace 进 standalone，需手动补齐
# （否则运行时报 query engine / .prisma/client not found，见坑 17）
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.pnpm/@prisma+client@*/node_modules/.prisma ./node_modules/.prisma

USER nextjs
EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
