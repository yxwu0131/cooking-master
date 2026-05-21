"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChefHat, Users, BookOpen, Refrigerator, UtensilsCrossed, MessageSquare, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/lib/actions/session";

const navItems = [
  { href: "/dashboard", label: "首页", icon: ChefHat },
  { href: "/family", label: "家庭档案", icon: Users },
  { href: "/dishes", label: "菜品库", icon: BookOpen },
  { href: "/inventory", label: "食材库存", icon: Refrigerator },
  { href: "/cook", label: "开始做饭", icon: UtensilsCrossed },
  { href: "/feedback", label: "反馈历史", icon: MessageSquare },
];

export function AppNav({ userName }: { userName?: string | null }) {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="container mx-auto max-w-7xl px-4 flex h-16 items-center gap-4">
        <Link href="/dashboard" className="flex items-center gap-2.5 font-bold text-lg">
          <span className="inline-flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/30">
            <ChefHat className="size-5" />
          </span>
          <span className="tracking-tight">厨神</span>
        </Link>
        <nav className="hidden md:flex items-center gap-1 ml-4 flex-1">
          {navItems.slice(1).map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/12 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {userName && (
            <span className="text-sm text-muted-foreground hidden sm:inline">{userName}</span>
          )}
          <form action={logoutAction}>
            <Button type="submit" variant="ghost" size="icon" title="登出">
              <LogOut className="size-4" />
            </Button>
          </form>
        </div>
      </div>
      {/* 移动端底部导航 */}
      <nav className="md:hidden border-t bg-background/95 backdrop-blur-md fixed bottom-0 left-0 right-0 z-40 pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5">
          {navItems.slice(1).map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-1 pt-2 pb-1.5 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <span
                  className={cn(
                    "inline-flex items-center justify-center rounded-full px-4 py-1 transition-colors",
                    active ? "bg-primary/12" : "bg-transparent"
                  )}
                >
                  <Icon className="size-[18px]" />
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
