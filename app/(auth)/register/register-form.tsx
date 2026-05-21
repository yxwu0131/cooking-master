"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { registerAction } from "@/lib/actions/auth";
import { validateInviteCodePublic } from "@/lib/actions/invite";
import { ChefHat, Users } from "lucide-react";

export function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawInvite = searchParams.get("invite")?.trim() ?? "";

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const [inviteState, setInviteState] = useState<
    | { kind: "none" }
    | { kind: "checking" }
    | { kind: "ok"; code: string; familyName: string }
    | { kind: "bad"; error: string }
  >(rawInvite ? { kind: "checking" } : { kind: "none" });

  useEffect(() => {
    if (!rawInvite) return;
    let cancelled = false;
    void validateInviteCodePublic(rawInvite).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setInviteState({ kind: "ok", code: rawInvite.toUpperCase(), familyName: res.familyName });
      } else {
        setInviteState({ kind: "bad", error: res.error });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [rawInvite]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    const formData = new FormData(e.currentTarget);
    if (inviteState.kind === "ok") {
      formData.set("inviteCode", inviteState.code);
    }
    startTransition(async () => {
      const result = await registerAction(formData);
      if (result.ok) {
        router.push("/dashboard");
        router.refresh();
      } else {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
      }
    });
  }

  const isInviteMode = inviteState.kind === "ok";
  const isInviteChecking = inviteState.kind === "checking";

  const title = isInviteMode ? "加入家庭" : "创建你的家庭";
  const description = isInviteMode
    ? `注册账号后会自动加入「${inviteState.familyName}」`
    : "注册后会自动创建一个家庭档案，可随时邀请家人加入";

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto rounded-lg bg-primary/10 p-2 w-fit mb-2">
          {isInviteMode ? (
            <Users className="size-6 text-primary" />
          ) : (
            <ChefHat className="size-6 text-primary" />
          )}
        </div>
        <CardTitle className="text-2xl">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>

      {isInviteChecking && (
        <div className="px-6 pb-3">
          <p className="text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
            正在校验邀请码…
          </p>
        </div>
      )}

      {inviteState.kind === "bad" && (
        <div className="px-6 pb-3">
          <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
            邀请码无效：{inviteState.error}。请向家人确认链接，或不带邀请码注册以创建新家庭。
          </p>
        </div>
      )}

      <form onSubmit={onSubmit}>
        <CardContent className="space-y-4">
          {!isInviteMode && (
            <div className="space-y-2">
              <Label htmlFor="familyName">家庭名称</Label>
              <Input
                id="familyName"
                name="familyName"
                required={!isInviteMode}
                placeholder="例如：张家小厨房"
              />
              {fieldErrors.familyName && (
                <p className="text-xs text-destructive">{fieldErrors.familyName[0]}</p>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="name">你的称呼</Label>
            <Input id="name" name="name" required placeholder="爸爸 / 妈妈 / 小明" />
            {fieldErrors.name && (
              <p className="text-xs text-destructive">{fieldErrors.name[0]}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">邮箱</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
            />
            {fieldErrors.email && (
              <p className="text-xs text-destructive">{fieldErrors.email[0]}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">密码</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              placeholder="至少 10 位"
            />
            {fieldErrors.password && (
              <p className="text-xs text-destructive">{fieldErrors.password[0]}</p>
            )}
          </div>
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
              {error}
            </p>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button
            type="submit"
            disabled={pending || isInviteChecking}
            className="w-full"
          >
            {pending
              ? "提交中..."
              : isInviteMode
                ? `加入「${inviteState.familyName}」`
                : "创建家庭并开始"}
          </Button>
          <p className="text-sm text-muted-foreground text-center">
            已有账号？{" "}
            <Link href="/login" className="text-primary hover:underline">
              直接登录
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
