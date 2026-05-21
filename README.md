# 厨神 · 家庭做饭规划系统

面向中国家庭的智能吃饭规划系统：**今天吃什么 → 买什么 → 怎么高效做完一顿饭**。

> 详细设计与产品定位见项目计划书。技术决策与踩坑日志见 [NOTES.md](./NOTES.md)。

## 技术栈

- **Next.js 16** App Router + React 19 + TailwindCSS v4 + shadcn/ui
- **Prisma 6** + PostgreSQL 16
- **Auth.js v5** 邮箱密码登录
- **DeepSeek API**（OpenAI 兼容）做智能菜单推荐
- **Docker Compose** 部署到极空间 ZAPro，**Caddy 2** 自动 SSL

---

## 本地开发

### 前置
- Node.js 22+
- pnpm 11+
- 本地 PostgreSQL（或用 Docker 起一个）

### 启动

```bash
# 1. 装依赖
pnpm install

# 2. 起一个本地 Postgres（如果还没有）
docker run -d --name cooking-pg \
  -e POSTGRES_PASSWORD=cooking_dev \
  -e POSTGRES_USER=cooking \
  -e POSTGRES_DB=cooking_master \
  -p 5432:5432 \
  postgres:16-alpine

# 3. 同步数据库 schema
node node_modules/prisma/build/index.js db push

# 4. 写入种子数据（食材 + 菜品）
node node_modules/tsx/dist/cli.mjs prisma/seed.ts

# 5. 启动
pnpm dev
```

打开 http://localhost:3000，注册账号体验。

> ⚠️ Windows 上 pnpm 11 的 `pnpm exec` / `pnpm run` 在某些场景会触发依赖检查死循环，直接用 `node` 调用 binary 更稳。详见 NOTES.md。

### AI 配置

DeepSeek 需要注册账号并获取 API Key：https://platform.deepseek.com/

在 `.env` 填入：
```
DEEPSEEK_API_KEY="sk-xxxxx"
DEEPSEEK_MODEL="deepseek-chat"   # 或最新可用型号
```

> 计划里写的「deepseek-v4-pro」需要在使用时核对 DeepSeek 实际的模型名称。当前生产模型一般是 `deepseek-chat`。

---

## 部署到极空间 ZAPro

### 准备

1. 域名 `dorianweb.com` DNS A 记录指向极空间公网 IP
2. 极空间路由器 80/443 端口转发到极空间内网 IP
3. 极空间安装 Docker（管家应用市场）

### 部署步骤

```bash
# 1. 把代码 clone/上传到极空间某个目录，如 /share/cooking-master
cd /share/cooking-master

# 2. 复制环境变量模板，填写真实值
cp .env.production.example .env
# 编辑 .env：
# - DOMAIN=dorianweb.com
# - LETSENCRYPT_EMAIL=你的邮箱
# - POSTGRES_PASSWORD=$(openssl rand -base64 24)
# - AUTH_SECRET=$(openssl rand -base64 32)
# - DEEPSEEK_API_KEY=sk-...

# 3. 一键启动
docker compose up -d --build

# 4. 跑种子数据（首次）
docker compose exec web node node_modules/tsx/dist/cli.mjs prisma/seed.ts

# 5. 查看状态
docker compose ps
docker compose logs -f caddy   # 看 SSL 证书申请状态
```

访问 https://dorianweb.com 应该能看到登录页。

### 备份与维护

- 数据库自动每日凌晨 3 点备份到 `./data/backups`，保留 14 天
- 菜品图片在 `./data/images`
- 升级：拉新代码 → `docker compose up -d --build`
- Schema 变更：`docker compose exec web node node_modules/prisma/build/index.js migrate deploy`

---

## 验证清单（P0 + P1 端到端）

1. **注册登录**：访问 / → 注册 → 自动跳转 /dashboard
2. **家庭档案**：/family → 添加成员（含小孩，标记不吃辣）→ 配置厨房（2 灶眼、有电饭锅）→ 设置偏好（清淡、不辣）
3. **食材库存**：/inventory → 批量添加（番茄、鸡蛋、土豆、青椒、豆腐、娃娃菜、牛肉等）
4. **菜品库**：/dishes → 浏览 → 把番茄炒蛋标记为「我家常做」、宫保鸡丁标记为「想尝试」
5. **灵感库**：/dishes → 灵感库 → 添加「想试红烧肉」
6. **开始做饭**：/cook/new → 晚餐 / 3 人（2 大 1 小） / 18:30 开饭 / 60 分钟内 / 勾选「想清淡」
7. **AI 推荐**：在 session 页面点「AI 推荐菜单」 → 应看到 2-3 套方案
8. **确认菜单**：选一套点「采用」 → 自动生成采购清单和时间线
9. **验证产出**：
   - 采购清单：按超市区域分组，常备调料已被排除
   - 做饭时间线：先启动米饭/电饭锅，叶菜在最后
   - 风险提示：青菜最后炒、生肉处理后清砧板等
10. **完成做饭 + 反馈**：点「做饭完成」 → 给菜评分 → 检查反馈是否影响下次推荐

---

## 项目结构

```
cooking-master/
├── app/
│   ├── (auth)/             登录注册
│   └── (app)/              主应用（需登录）
│       ├── dashboard/      仪表盘
│       ├── family/         家庭档案（成员/厨房/偏好）
│       ├── dishes/         菜品库 + 灵感库
│       ├── inventory/      食材库存
│       ├── cook/           做饭流程核心
│       └── feedback/       反馈历史
├── components/
│   ├── ui/                 shadcn/ui 基础组件
│   ├── family/             家庭档案表单
│   ├── dishes/             菜品库相关
│   ├── inventory/          库存管理
│   └── cook/               做饭流程
├── lib/
│   ├── ai/                 AI Provider 抽象层 + DeepSeek 实现 + prompts
│   ├── actions/            Server Actions
│   ├── planning/           采购清单 + 时间线算法
│   ├── auth-helper.ts      认证与租户隔离
│   └── db.ts               Prisma client 单例
├── prisma/
│   ├── schema.prisma       数据模型（21 张表）
│   └── seed.ts             种子数据（40+ 食材 + 18 道菜）
├── docker-compose.yml      部署：web + db + caddy + backup
├── Caddyfile               反向代理 + 自动 SSL
└── Dockerfile              多阶段构建
```

---

## 路线图

详见项目计划书。当前进度：

- ✅ **P0 基础骨架**：Next.js + Auth + Schema + Docker
- ✅ **P1 MVP 核心闭环**：家庭档案 → 库存 → 点菜 → AI 推荐 → 菜单确认 → 采购清单 → 做饭时间线 → 反馈
- ⬜ **P2 体验完善**：多方案对比优化、锅具冲突严格检测、家人独立点菜入口
- ⬜ **P3 打磨**：菜品图片、小红书解析、营养统计、PWA
- ⬜ **P4 App**：Capacitor 包壳 + 推送通知
