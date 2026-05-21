import { getCurrentFamily, requireUser } from "@/lib/auth-helper";
import { prisma } from "@/lib/db";
import { listInviteCodesAction } from "@/lib/actions/invite";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MembersSection } from "@/components/family/members-section";
import { KitchenSection } from "@/components/family/kitchen-section";
import { PreferenceSection } from "@/components/family/preference-section";
import { AccountsSection } from "@/components/family/accounts-section";

export default async function FamilyPage() {
  const [family, user] = await Promise.all([getCurrentFamily(), requireUser()]);
  const isAdmin = user.role === "ADMIN";

  const [users, invites] = await Promise.all([
    prisma.user.findMany({
      where: { familyId: family.id },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { createdAt: "asc" },
    }),
    listInviteCodesAction(),
  ]);

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6">
      <div className="space-y-1 mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{family.name}</h1>
        <p className="text-sm text-muted-foreground">
          完善家庭档案，让厨神推荐越来越准。
        </p>
      </div>

      <Tabs defaultValue="members">
        <TabsList className="grid w-full grid-cols-4 max-w-xl">
          <TabsTrigger value="members">成员（{family.members.length}）</TabsTrigger>
          <TabsTrigger value="accounts">账户（{users.length}）</TabsTrigger>
          <TabsTrigger value="kitchen">厨房</TabsTrigger>
          <TabsTrigger value="preference">口味偏好</TabsTrigger>
        </TabsList>
        <TabsContent value="members" className="mt-6">
          <MembersSection members={family.members} />
        </TabsContent>
        <TabsContent value="accounts" className="mt-6">
          <AccountsSection isAdmin={isAdmin} invites={invites} users={users} />
        </TabsContent>
        <TabsContent value="kitchen" className="mt-6">
          <KitchenSection kitchen={family.kitchen} />
        </TabsContent>
        <TabsContent value="preference" className="mt-6">
          <PreferenceSection preference={family.preference} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
