"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TagsInput } from "@/components/ui/tags-input";
import { updatePreferenceAction, type PreferenceInput } from "@/lib/actions/family";

const CUISINES = ["家常菜", "粤菜", "川菜", "湘菜", "江浙菜", "北方菜", "西餐", "日料", "东南亚"];
const HEALTH_GOALS = ["减脂", "高蛋白", "控糖", "低嘌呤", "孕期", "哺乳期"];

type Preference = {
  cuisines: string[];
  tasteFlags: unknown;
  childFriendly: boolean;
  needLunchBox: boolean;
  healthGoals: string[];
} | null;

export function PreferenceSection({ preference }: { preference: Preference }) {
  const flags = (preference?.tasteFlags as Record<string, boolean> | null) ?? {};
  const [data, setData] = React.useState<PreferenceInput>({
    cuisines: preference?.cuisines ?? ["家常菜"],
    light: flags.light ?? false,
    hearty: flags.hearty ?? false,
    lowOilSalt: flags.lowOilSalt ?? false,
    noSpicy: flags.noSpicy ?? false,
    mildSpicy: flags.mildSpicy ?? false,
    childFriendly: preference?.childFriendly ?? false,
    needLunchBox: preference?.needLunchBox ?? false,
    healthGoals: preference?.healthGoals ?? [],
  });
  const [pending, startTransition] = React.useTransition();

  function save() {
    startTransition(async () => {
      const result = await updatePreferenceAction(data);
      if (result.ok) toast.success("偏好已保存");
      else toast.error(result.error);
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">家庭口味偏好</h2>
        <p className="text-sm text-muted-foreground">
          影响每次推荐菜单的整体倾向。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">菜系偏好</CardTitle>
          <CardDescription>选喜欢的菜系，多选</CardDescription>
        </CardHeader>
        <CardContent>
          <TagsInput
            value={data.cuisines}
            onChange={(v) => setData({ ...data, cuisines: v })}
            suggestions={CUISINES}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">口味标志</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-2">
            {[
              ["light", "偏清淡"],
              ["hearty", "偏下饭"],
              ["lowOilSalt", "少油少盐"],
              ["noSpicy", "完全不辣"],
              ["mildSpicy", "可微辣"],
              ["childFriendly", "儿童友好"],
              ["needLunchBox", "经常带饭"],
            ].map(([key, label]) => (
              <label
                key={key}
                className="flex items-center justify-between rounded-md border px-3 py-2 cursor-pointer"
              >
                <span className="text-sm">{label}</span>
                <Switch
                  checked={data[key as keyof PreferenceInput] as boolean}
                  onCheckedChange={(checked) =>
                    setData({ ...data, [key]: checked } as PreferenceInput)
                  }
                />
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">健康目标</CardTitle>
        </CardHeader>
        <CardContent>
          <TagsInput
            value={data.healthGoals}
            onChange={(v) => setData({ ...data, healthGoals: v })}
            placeholder="如：减脂、高蛋白"
            suggestions={HEALTH_GOALS}
          />
        </CardContent>
      </Card>

      <Button onClick={save} disabled={pending}>
        {pending ? "保存中..." : "保存偏好"}
      </Button>
    </div>
  );
}
