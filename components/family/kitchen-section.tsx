"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { TagsInput } from "@/components/ui/tags-input";
import { updateKitchenAction, type KitchenInput } from "@/lib/actions/family";

const COMMON_SEASONINGS = [
  // 基础酱油醋
  "生抽", "老抽", "蒸鱼豉油", "陈醋", "香醋", "白醋", "米醋", "料酒", "黄酒", "啤酒",
  // 盐糖糖类
  "盐", "白糖", "冰糖", "红糖", "蜂蜜",
  // 油
  "食用油", "花生油", "菜籽油", "玉米油", "葵花籽油", "橄榄油", "芝麻油", "香油", "辣椒油",
  // 鲜味提味
  "蚝油", "鸡精", "味精", "鱼露", "虾酱",
  // 辣椒类
  "豆瓣酱", "辣椒酱", "老干妈", "辣椒粉", "干辣椒", "小米椒", "剁椒", "泡椒", "豆豉",
  // 香料
  "花椒", "胡椒粉", "白胡椒粉", "黑胡椒粉", "八角", "桂皮", "香叶", "丁香", "草果",
  "孜然", "孜然粉", "五香粉", "十三香", "咖喱粉", "藤椒", "麻椒",
  // 粉类
  "淀粉", "玉米淀粉", "土豆淀粉", "红薯淀粉", "面粉", "面包糠",
  // 酱料
  "番茄酱", "番茄沙司", "甜面酱", "黄豆酱", "海鲜酱", "沙茶酱", "芝麻酱", "花生酱",
  "芥末", "蛋黄酱", "千岛酱", "沙拉酱",
  // 西式
  "黄油", "奶酪粉", "罗勒叶", "迷迭香", "百里香", "牛至", "肉桂粉",
  // 其他
  "腐乳", "酱豆腐", "酸菜", "榨菜", "梅干菜",
];

const COMMON_STAPLES = [
  "大米", "糙米", "糯米", "小米", "燕麦", "杂粮米",
  "面条", "挂面", "刀削面", "拉面", "意大利面", "乌冬面", "拉条子",
  "馒头", "花卷", "饺子皮", "包子皮", "馄饨皮", "饺子", "包子", "馄饨",
  "面粉", "饼皮", "披萨饼", "面包", "土司", "百吉饼",
  "河粉", "米粉", "螺蛳粉", "桂林米粉", "粉丝", "粉条",
  "年糕", "粽子", "玉米", "红薯", "山药", "土豆",
];

const COMMON_COOKWARE = [
  // 常用锅具
  "炒锅", "不粘锅", "铁锅", "平底锅", "煎锅",
  "汤锅", "奶锅", "深口锅", "砂锅", "陶瓷锅",
  // 蒸/煮
  "蒸锅", "蒸笼", "蒸屉",
  "电饭锅", "电饭煲", "电压力锅", "高压锅", "电炖锅", "慢炖锅",
  "电磁炉", "电陶炉",
  // 烤/炸
  "烤箱", "微波炉", "空气炸锅", "烤盘", "烤架", "烤网",
  "油炸锅", "电火锅", "电烤盘",
  // 西式 / 西餐
  "西餐铁锅", "牛排煎锅", "意面锅", "酱汁锅", "深平底锅",
  // 早餐 / 多功能
  "三明治机", "华夫饼机", "电饼铛", "煎蛋锅",
  // 配套工具（不严格是锅，但常用）
  "厨师机", "破壁机", "搅拌机", "原汁机",
];

type Kitchen = {
  cookware: string[];
  stoveCount: number;
  hasDishwasher: boolean;
  hasRiceCooker: boolean;
  hasAirFryer: boolean;
  hasOven: boolean;
  hasSteamer: boolean;
  hasPressureCooker: boolean;
  commonSeasonings: string[];
  staples: string[];
} | null;

export function KitchenSection({ kitchen }: { kitchen: Kitchen }) {
  const [data, setData] = React.useState<KitchenInput>({
    cookware: kitchen?.cookware ?? ["炒锅", "汤锅"],
    stoveCount: kitchen?.stoveCount ?? 2,
    hasDishwasher: kitchen?.hasDishwasher ?? false,
    hasRiceCooker: kitchen?.hasRiceCooker ?? true,
    hasAirFryer: kitchen?.hasAirFryer ?? false,
    hasOven: kitchen?.hasOven ?? false,
    hasSteamer: kitchen?.hasSteamer ?? false,
    hasPressureCooker: kitchen?.hasPressureCooker ?? false,
    commonSeasonings: kitchen?.commonSeasonings ?? COMMON_SEASONINGS,
    staples: kitchen?.staples ?? ["大米"],
  });
  const [pending, startTransition] = React.useTransition();

  function save() {
    startTransition(async () => {
      const result = await updateKitchenAction(data);
      if (result.ok) toast.success("厨房设置已保存");
      else toast.error(result.error);
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">厨房条件</h2>
        <p className="text-sm text-muted-foreground">
          系统会根据厨具和灶眼数量规划做饭顺序，避免锅具冲突。做饭熟练度请在家庭成员里按人设置。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">硬件</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>灶眼数量</Label>
              <Input
                type="number"
                min={1}
                max={8}
                value={data.stoveCount}
                onChange={(e) => setData({ ...data, stoveCount: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>常用厨具</Label>
            <TagsInput
              value={data.cookware}
              onChange={(v) => setData({ ...data, cookware: v })}
              placeholder="炒锅、汤锅..."
              suggestions={COMMON_COOKWARE}
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-2">
            {[
              ["hasRiceCooker", "电饭锅"],
              ["hasSteamer", "蒸锅"],
              ["hasPressureCooker", "高压锅"],
              ["hasAirFryer", "空气炸锅"],
              ["hasOven", "烤箱"],
              ["hasDishwasher", "洗碗机"],
            ].map(([key, label]) => (
              <label
                key={key}
                className="flex items-center justify-between rounded-md border px-3 py-2 cursor-pointer"
              >
                <span className="text-sm">{label}</span>
                <Switch
                  checked={data[key as keyof KitchenInput] as boolean}
                  onCheckedChange={(checked) =>
                    setData({ ...data, [key]: checked } as KitchenInput)
                  }
                />
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">常备食材与调料</CardTitle>
          <CardDescription>采购清单会自动排除这些</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>常备调料</Label>
            <TagsInput
              value={data.commonSeasonings}
              onChange={(v) => setData({ ...data, commonSeasonings: v })}
              suggestions={COMMON_SEASONINGS}
            />
          </div>
          <div className="space-y-1.5">
            <Label>常备主食</Label>
            <TagsInput
              value={data.staples}
              onChange={(v) => setData({ ...data, staples: v })}
              suggestions={COMMON_STAPLES}
            />
          </div>
        </CardContent>
      </Card>

      <Button onClick={save} disabled={pending}>
        {pending ? "保存中..." : "保存厨房设置"}
      </Button>
    </div>
  );
}
