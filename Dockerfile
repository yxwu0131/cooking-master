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
RUN pnpm install --frozen-lockfile

# 阶段 2: 构建
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.1.2 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 生成 Prisma client
RUN pnpm exec prisma generate

ENV NEXT_TELEMETRY_DISABLED=1
# 构建期占位 DATABASE_URL（next build 不会真连库；运行时由 compose 注入覆盖）
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"
RUN pnpm build

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

# Prisma 运行时需要 schema 和 query engine
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/client ./node_modules/@prisma/client

USER nextjs
EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
