"use client";

import * as React from "react";
import { toast } from "sonner";
import { Copy, Plus, RotateCcw, Trash2, UserCircle, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  createInviteCodeAction,
  revokeInviteCodeAction,
  type InviteCodeSummary,
} from "@/lib/actions/invite";
import { formatLocal } from "@/lib/format";

type AccountUser = {
  id: string;
  name: string | null;
  email: string;
  role: string;
};

export function AccountsSection({
  isAdmin,
  invites: initialInvites,
  users,
}: {
  isAdmin: boolean;
  invites: InviteCodeSummary[];
  users: AccountUser[];
}) {
  const [invites, setInvites] = React.useState(initialInvites);
  const [pending, startTransition] = React.useTransition();

  function createInvite() {
    startTransition(async () => {
      const res = await createInviteCodeAction({ expiresInDays: 7 });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      // 简化处理：刷新页面拿最新列表（server action 已 revalidatePath）
      const link = buildInviteUrl(res.code);
      await tryCopy(link);
      toast.success(`邀请码 ${res.code} 已生成（链接已复制）`);
      // 乐观更新本地
      setInvites((prev) => [
        {
          id: crypto.randomUUID(),
          code: res.code,
          expiresAt: res.expiresAt,
          usedAt: null,
          usedBy: null,
          usedByName: null,
          createdAt: new Date(),
          status: "active" as const,
        },
        ...prev,
      ]);
    });
  }

  function revoke(id: string) {
    if (!confirm("撤销这个邀请码？撤销后链接将失效。")) return;
    startTransition(async () => {
      const res = await revokeInviteCodeAction(id);
      if (res.ok) {
        setInvites((prev) => prev.filter((x) => x.id !== id));
        toast.success("已撤销");
      } else {
        toast.error(res.error);
      }
    });
  }

  function copyLink(code: string) {
    const link = buildInviteUrl(code);
    void tryCopy(link).then((ok) => {
      if (ok) toast.success("链接已复制");
      else toast.error("复制失败，请手动选取");
    });
  }

  const activeInvites = invites.filter((x) => x.status === "active");
  const historyInvites = invites.filter((x) => x.status !== "active");

  return (
    <div className="space-y-6">
      {/* 已加入账户 */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">家庭账户（{users.length}）</h2>
          <p className="text-sm text-muted-foreground">
            同一家庭的成员共享菜品、库存、做饭历史。
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {users.map((u) => (
            <Card key={u.id} className="py-3">
              <CardContent className="px-4 flex items-center gap-3">
                <UserCircle className="size-8 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{u.name ?? u.email}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                    <Mail className="size-3" />
                    {u.email}
                  </div>
                </div>
                <Badge variant={u.role === "ADMIN" ? "default" : "outline"}>
                  {u.role === "ADMIN" ? "管理员" : u.role === "CHEF" ? "厨师" : "成员"}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* 邀请码 */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">邀请家人加入</h2>
            <p className="text-sm text-muted-foreground">
              生成邀请码后发给家人，他们注册时自动加入本家庭。
            </p>
          </div>
          {isAdmin && (
            <Button onClick={createInvite} disabled={pending} size="sm">
              <Plus className="size-4" />
              生成邀请码
            </Button>
          )}
        </div>

        {!isAdmin && (
          <p className="text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
            仅管理员可生成邀请码。
          </p>
        )}

        {activeInvites.length === 0 && isAdmin && (
          <p className="text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
            暂无可用邀请码，点上方按钮生成一个。
          </p>
        )}

        <div className="space-y-2">
          {activeInvites.map((iv) => (
            <Card key={iv.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <CardTitle className="text-base font-mono tracking-wider">
                      {iv.code}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {formatLocal(iv.expiresAt)} 过期
                    </CardDescription>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => copyLink(iv.code)}
                      title="复制注册链接"
                    >
                      <Copy className="size-3.5" />
                    </Button>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => revoke(iv.id)}
                        disabled={pending}
                        title="撤销"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground pb-3">
                注册链接：
                <code className="ml-1 break-all">{buildInviteUrl(iv.code)}</code>
              </CardContent>
            </Card>
          ))}
        </div>

        {historyInvites.length > 0 && (
          <details className="rounded-md border bg-muted/30 px-3 py-2">
            <summary className="cursor-pointer text-sm text-muted-foreground">
              历史邀请码（{historyInvites.length}）
            </summary>
            <ul className="mt-2 space-y-1 text-xs">
              {historyInvites.map((iv) => (
                <li key={iv.id} className="flex items-center justify-between gap-2">
                  <span className="font-mono">{iv.code}</span>
                  <span className="text-muted-foreground">
                    {iv.status === "used"
                      ? `已被 ${iv.usedByName ?? "用户"} 使用（${formatLocal(iv.usedAt!)}）`
                      : `已过期（${formatLocal(iv.expiresAt)}）`}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}

function buildInviteUrl(code: string): string {
  if (typeof window === "undefined") return `/register?invite=${code}`;
  return `${window.location.origin}/register?invite=${code}`;
}

async function tryCopy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
