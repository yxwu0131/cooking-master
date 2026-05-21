import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChefHat, ShoppingBasket, Timer, Sparkles } from "lucide-react";

const features = [
  {
    icon: Sparkles,
    title: "智能菜单推荐",
    desc: "根据家庭口味、现有食材、就餐人数和可用时间，自动推荐一顿完整的家常菜组合。",
  },
  {
    icon: ShoppingBasket,
    title: "自动采购清单",
    desc: "菜单确认后立即生成采购清单，按超市区域分组，区分已有和待买。",
  },
  {
    icon: Timer,
    title: "做饭时间线",
    desc: "考虑锅具、灶眼和步骤依赖，规划出最高效的做饭顺序，让所有菜同时热着上桌。",
  },
  {
    icon: ChefHat,
    title: "越用越懂你家",
    desc: "通过吃后反馈不断学习家人口味，推荐越来越贴合真实喜好。",
  },
];

export default function HomePage() {
  return (
    <main className="flex-1">
      <section className="container mx-auto max-w-5xl px-4 py-16 sm:py-24">
        <div className="text-center space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border bg-card px-4 py-1.5 text-sm">
            <ChefHat className="size-4" />
            <span>面向中国家庭的智能吃饭规划系统</span>
          </div>
          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight">
            今天吃什么？
            <br />
            <span className="text-muted-foreground">让厨神来安排</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            从「不知道吃什么」到「所有菜同时上桌」，一站式解决家庭做饭决策、采购、排程三大难题。
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
            <Button asChild size="lg">
              <Link href="/register">立即开始</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/login">已有账号 · 登录</Link>
            </Button>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mt-16">
          {features.map((f) => (
            <Card key={f.title}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <f.icon className="size-5 text-primary" />
                  </div>
                  <CardTitle>{f.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription>{f.desc}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
