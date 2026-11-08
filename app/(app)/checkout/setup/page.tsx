import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { CheckoutSetups } from "@/components/checkout/checkout-setups";
import { getActiveSession, requireUser } from "@/lib/auth/current-user";
import { isAdmin } from "@/lib/auth/permissions";
import { loadAreaTree } from "@/lib/data/areas";
import { createAdminClient } from "@/lib/supabase/admin";
import { CHECKIN_LOGIN, FINAL_CHECKOUTS_KEY, parseSetups } from "@/lib/checkout/setups";
import { ROLE_ORDER, STAFF_ROLES } from "@/lib/labels";

export const metadata = { title: "Set up final check-out" };

/** Directors over all of camp: the final check-outs, each its camps and who may use it. */
export default async function CheckoutSetupPage() {
  const me = await requireUser();
  if (!isAdmin(me)) redirect("/checkout");
  const admin = createAdminClient();
  const session = await getActiveSession();
  const [tree, { data }] = await Promise.all([loadAreaTree(admin, session?.id), admin.from("settings").select("value").eq("key", FINAL_CHECKOUTS_KEY).maybeSingle()]);
  const camps = tree.groups.map((g) => ({ value: g.id, label: g.name }));
  // only this session's camps: a set-up from an earlier session covers nothing now
  const setups = parseSetups(data?.value).filter((s) => s.camps.some((c) => camps.some((x) => x.value === c)));
  const kinds = [
    { value: CHECKIN_LOGIN, label: "Check-in logins" },
    ...ROLE_ORDER.filter((r) => r !== "owner" && r !== "director").map((r) => ({ value: r, label: STAFF_ROLES[r].label })),
  ];
  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/checkout", label: "Final check-out" }}
        title="Set up final check-out"
        description="Make a final check-out for one camp or several, and choose who can do it. Several can run at once (one for American & French, another for Hebrew)."
      />
      <CheckoutSetups setups={setups} camps={camps} kinds={kinds} />
    </div>
  );
}
