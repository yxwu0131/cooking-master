# 厨神 · 极空间部署清单

本指南假设：极空间 ZAPro NAS、Docker Compose、域名 `dorianweb.com`。

---

## ⭐ 实战路径（最终采用）：GHCR 镜像 + Cloudflare Tunnel

适配极空间实际情况：SSH 账号沙箱化（HOME 只读、docker 需 sudo），现有项目走 **GHCR 镜像 + watchtower 自动更新**，已有 cloudflared 隧道，端口 3000 被 `child-growth` 占用。

**架构**：GitHub Actions 构建镜像推 GHCR → NAS 拉镜像跑（不在 NAS 构建）→ web 暴露 `3001` → 复用现有 cloudflared 隧道 → `cook.dorianweb.com`。

### A. 镜像（已自动化）
推 `main` 触发 `.github/workflows/docker-build.yml`，构建并推送：
- `ghcr.io/yxwu0131/cooking-master:latest`（web 运行镜像）
- `ghcr.io/yxwu0131/cooking-master:migrate`（一次性建表+种子）

首次构建后，到 GitHub → 该 package → Package settings → 设为 **Public**（或在 NAS `sudo docker login ghcr.io`）。

### B. NAS 上部署（SSH + sudo）
```bash
# 1. 选一个持久化可写目录（用 sudo df -h 找数据卷，例如 /share/Container）
sudo mkdir -p /share/Container/cooking-master && cd /share/Container/cooking-master

# 2. 放 docker-compose.prod.yml（从仓库拷或 curl 下载 raw 文件）
sudo curl -fsSL -o docker-compose.prod.yml \
  https://raw.githubusercontent.com/yxwu0131/cooking-master/main/docker-compose.prod.yml

# 3. 写 .env（POSTGRES_PASSWORD/AUTH_SECRET 用 openssl 生成，DEEPSEEK_API_KEY 填你的）
sudo tee .env >/dev/null <<EOF
POSTGRES_USER=cooking
POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=')
POSTGRES_DB=cooking_master
AUTH_SECRET=$(openssl rand -base64 32)
AUTH_URL=https://cook.dorianweb.com
NEXT_PUBLIC_APP_URL=https://cook.dorianweb.com
DEEPSEEK_API_KEY=sk-把你的key填这里
DEEPSEEK_API_BASE=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
EOF

# 4. 拉镜像 + 起服务
sudo docker compose -f docker-compose.prod.yml pull
sudo docker compose -f docker-compose.prod.yml up -d

# 5. 验证：migrate 日志应见「214 食材/68 菜/✅完成」后 Exited(0)；web 本地通
sudo docker compose -f docker-compose.prod.yml logs migrate
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3001/login   # 期望 200
```

### C. Cloudflare 加子域名路由（复用现有隧道）
Zero Trust → Networks → Tunnels → 现有隧道 → Public Hostname → Add：
`cook` . `dorianweb.com` | Type `HTTP` | URL `<NAS局域网IP>:3001`

保存后 `https://cook.dorianweb.com` 即通（DNS+TLS 全由 Cloudflare 托管）。

---

## 以下为通用/备选方法（本地构建、Caddy 自签证书等），实战未采用，留作参考

## 推荐路径：先局域网（LAN）跑通，再上公网域名

部署分两个 profile：
- **LAN（默认，无 Caddy）**：`docker compose -f docker-compose.yml -f docker-compose.lan.yml up -d`，web 暴露在 NAS 的 `3000` 端口，局域网用 `http://<NAS局域网IP>:3000` 访问。**不需要域名/公网IP/证书**，只需要 DeepSeek Key。
- **public（加 Caddy + TLS）**：`docker compose --profile public up -d`，需要域名 DNS + 公网 IP + 80/443 转发。

建议先 LAN 跑通验证全流程，等域名和公网条件齐了再切 public。

**操作方式：强烈建议 SSH** 而不是极空间图形 Container Manager——这套是 4 服务 compose 编排（含 build、一次性 migrate 容器、depends_on 条件），SSH 里 `docker compose up -d` 一句拉起；图形界面逐个配极易出错。先在极空间「设置 → 终端机/SSH」开启 SSH。

## 0. 前置检查

**LAN 部署现在就需要：**
- [ ] NAS 已安装 Docker / Container Manager，且 `docker compose version` 可用（v2）
- [ ] NAS 已开启 SSH
- [ ] NAS 可以联网（`curl https://api.deepseek.com` 通）
- [ ] **有效的 DeepSeek API Key**（硬门槛：没有它容器栈起不来，且 AI 推荐是核心功能；先在本地 .env 试通）

**上公网域名时再需要：**
- [ ] 域名 `dorianweb.com` 已购买，可改 DNS
- [ ] 路由器有公网 IP（或准备走 frpc 隧道）
- [ ] LETSENCRYPT_EMAIL 填真实邮箱

## 1. 上传项目代码

**方式 A（推荐）：用 git**
```bash
# 在 NAS SSH 里
mkdir -p /share/Container/cooking-master
cd /share/Container/cooking-master
git clone <你的仓库> .
```

**方式 B：直接 scp 整个目录**
```powershell
# 在 Windows 这边
# 排除 node_modules / .next / data
scp -r "E:\claude code\cooking master" admin@<NAS-IP>:/share/Container/cooking-master/
```

## 2. 配置环境变量

```bash
cd /share/Container/cooking-master
cp .env.production.example .env

# 生成密钥
openssl rand -base64 24    # → POSTGRES_PASSWORD
openssl rand -base64 32    # → AUTH_SECRET

# 编辑 .env，填入：
# - POSTGRES_PASSWORD（上面生成的）
# - AUTH_SECRET（上面生成的）
# - DEEPSEEK_API_KEY（你的 key，必填）
# - DEEPSEEK_MODEL=deepseek-chat（不要用 v4-pro）
#
# 【LAN 部署】AUTH_URL / NEXT_PUBLIC_APP_URL 填 NAS 局域网地址：
# - AUTH_URL=http://<NAS局域网IP>:3000
# - NEXT_PUBLIC_APP_URL=http://<NAS局域网IP>:3000
#
# 【public 部署再改成】：
# - DOMAIN=dorianweb.com
# - AUTH_URL=https://dorianweb.com
# - NEXT_PUBLIC_APP_URL=https://dorianweb.com
# - LETSENCRYPT_EMAIL=你的邮箱
```

## 3. 构建并启动

```bash
# 先 build（会构建 builder + runner 两个镜像目标）
docker compose build

# 【LAN 部署，推荐先这个】启动 db → migrate → web（暴露 3000），不含 caddy
docker compose -f docker-compose.yml -f docker-compose.lan.yml up -d

# 【public 部署】等域名/公网就绪后改用：
# docker compose --profile public up -d

# 启动顺序：db(healthy) → migrate(建表+灌种子，跑完退出) → web [→ caddy(仅public)]

# 看 migrate 一次性容器日志，确认建表 + 种子成功
docker compose logs migrate

# 看 web 日志确认服务起来
docker compose logs -f web
```

期望日志：
- `migrate` 容器：prisma `db push` 输出 `Your database is now in sync`，然后种子脚本打印 `写入 214 种食材` / `写入 68 道菜品` / `✅ 种子数据初始化完成`，容器 `Exited (0)`
- `web` 容器：`Server listening on http://0.0.0.0:3000`（或 Next 的 `Ready` 日志）
- `db` 容器：`database system is ready to accept connections`
- `caddy` 容器（仅 public profile）：`certificate obtained successfully` 或 `serving initial configuration`

> **说明（2026-05-22 重构）**：本项目开发期一直用 `prisma db push`（无 migrations 目录），生产镜像（standalone runner）不带 prisma CLI / tsx，所以建表 + 灌种子改由独立的 **`migrate` 服务**完成——它用 builder 阶段镜像（含全量依赖 + seed.ts），跑 `db push --skip-generate && tsx prisma/seed.ts` 后退出，`web` 用 `depends_on: migrate: service_completed_successfully` 等它完成。**无需再手动进容器跑 seed**。seed 用 upsert，每次 `up` 重跑都安全（幂等）。
>
> 如果将来要切到正规 migrations 流程：本地 `prisma migrate dev` 生成 `prisma/migrations/`，提交后把 migrate 服务命令改回 `prisma migrate deploy`。

## 4.（已自动化，无需手动操作）

种子数据由上面的 `migrate` 服务自动灌入。仅当需要重灌时，可单独重跑：
```bash
docker compose run --rm migrate
```

## 5. 对外暴露：Cloudflare Tunnel（推荐，cook.dorianweb.com）

域名 dorianweb.com 在 Cloudflare，NAS 上很可能已有 cloudflared 隧道容器（现有项目用的）。本项目**复用该隧道加一条子域名路由即可**，免公网 IP、免端口转发、Cloudflare 自动 TLS，**不需要 Caddy（public profile 不用启）**。

**前提**：本项目用 LAN profile 部署，web 暴露在 NAS 的 `3000` 端口（`docker-compose.lan.yml`）。

**步骤（Cloudflare Zero Trust 后台）：**
1. 先在 NAS 上 `docker ps` 找到 cloudflared 容器，确认隧道名（现有项目那条）。
2. 进 Cloudflare 一站式 dashboard → **Zero Trust → Networks → Tunnels → 选中那条隧道 → Public Hostname → Add a public hostname**：
   - Subdomain: `cook`
   - Domain: `dorianweb.com`
   - Type: `HTTP`
   - URL: `<NAS局域网IP>:3000`（例如 `192.168.x.x:3000`；cloudflared 在容器里跑时不能写 localhost，要写 NAS 的局域网 IP）
3. 保存后 Cloudflare 会自动建好 `cook.dorianweb.com` 的 DNS（CNAME 到隧道）和证书，无需手动加 DNS 记录。

**.env 对应改**：`AUTH_URL=https://cook.dorianweb.com`、`NEXT_PUBLIC_APP_URL=https://cook.dorianweb.com`。

> 若现有项目不是 cloudflared，而是 **公网 IP + 端口转发**：在 Cloudflare 加 A 记录 `cook` → 公网 IP，路由器转发 80/443 到 NAS，再用 `docker compose --profile public up -d`（启 Caddy，DOMAIN=cook.dorianweb.com）。
>
> 若想给本项目**新建独立隧道**：`docker compose -f docker-compose.yml -f docker-compose.lan.yml -f docker-compose.cloudflared.yml up -d`（需在 .env 填 `CF_TUNNEL_TOKEN`，见该 override 文件）。

## 6. 验收清单

访问地址：LAN 部署用 `http://<NAS局域网IP>:3000`；public 部署用 `https://dorianweb.com`。
- [ ] （public）HTTPS 证书生效（小锁图标）
- [ ] migrate 容器 `Exited (0)`，日志显示种子写入完成（214 食材 / 68 菜品）
- [ ] 注册账号 → 自动登录 → 跳到 /dashboard
- [ ] 进 /dishes，能看到 68+ 道菜（说明种子灌入成功）
- [ ] 进 /family，建家庭成员
- [ ] 进 /inventory，批量加几样食材
- [ ] 进 /cook/new，建一顿，AI 推荐
- [ ] 确认菜单，看时间线和采购清单
- [ ] 做饭完成 → 提交反馈

## 7. 备份

`backup` 容器已配好每日 03:00 全量备份，保留 14 天，落地 `./data/backups/cooking_YYYYMMDD_HHMMSS.dump`。

**手动备份：**
```bash
docker compose exec backup sh -c 'pg_dump -Fc -f /backups/manual_$(date +%Y%m%d_%H%M%S).dump'
```

**还原：**
```bash
docker compose exec -T db pg_restore -U cooking -d cooking_master --clean --if-exists < ./data/backups/<file>.dump
```

## 8. 升级流程

```bash
git pull
docker compose build
docker compose up -d
# prisma migrate deploy 在 web 容器启动时自动跑
```

## 9. 常见问题

| 问题 | 解决 |
|------|------|
| Caddy 拿不到证书 | 检查 80 端口是否真的对外通；用 `curl http://dorianweb.com` 测 |
| web 容器循环重启 | `docker compose logs web` 看错误，多半是 `.env` 缺值或 DB 没起来 |
| AI 推荐超时 | 确认 `DEEPSEEK_MODEL=deepseek-chat`，不是 v4-pro |
| 时间显示偏 8h | 已在代码层强制 `Asia/Shanghai`，若仍偏请检查容器 `TZ` env |
| 浏览器报 hydration 失败 | 生产用 next start 不会有 dev-only 的 `allowedDevOrigins` 限制 |
