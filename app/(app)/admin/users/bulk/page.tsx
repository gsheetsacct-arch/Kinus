import { Download } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Button } from "@/components/ui/button";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveSession, requireStaffManager } from "@/lib/auth/current-user";
import { canManageRole, isAdmin, isDirector } from "@/lib/auth/permissions";
import { ROLE_ORDER, STAFF_ROLES } from "@/lib/labels";
import { grantableTree, loadAreaTree } from "@/lib/data/areas";
import { loadRoles, rolesInUse } from "@/lib/data/roles";
import { TEMPLATE_HEADERS, templateRows } from "@/lib/staff/template";
import { applyBulkAdd, previewBulkAdd } from "../actions";
import { BulkAdd } from "./bulk-add";

export const metadata = { title: "Add many staff" };

/** Words the sheet may use for each role (any of them works, in any capitals). */
const ROLE_WORDS: Partial<Record<string, string>> = {
  director: "Admin",
  division_head: "DH, Rosh",
  kloli: "Klolim, Klali",
  head_counselor: "HC, Head staff",
  counselor: "Counsellor, Madrich",
  staff: "Staff, Kitchen staff…",
  scanner: "Helper, Scanner, Volunteer",
  office: "Secretary, Registration",
  logistics: "Transport, Buses",
};

export default async function BulkAddPage() {
  const me = await requireStaffManager();
  const session = await getActiveSession();
  const admin = createAdminClient();
  const [fullTree, setup] = await Promise.all([loadAreaTree(admin, session?.id), loadRoles(admin)]);
  const tree = grantableTree(me, fullTree);
  const roles = rolesInUse(setup, ROLE_ORDER).filter((r) => canManageRole(me, r));
  const oneDivision = tree.divisions.length === 1 ? tree.divisions[0] : null;
  const example = [TEMPLATE_HEADERS, ...templateRows(tree, roles)].map((r) => r.join("\t")).join("\n");
  const cell = "px-3 py-2 align-top";
  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader back={{ href: "/admin/users", label: "Staff" }} title="Add many staff at once" description="Fill in a sheet, paste or upload it, check it, and everyone is set up in one go." />

      <Section title="How to set up the sheet" description="One person per row, with a header row. Columns can be in any order; only Name and Email are required.">
        <div className="space-y-5">
          <Button asChild variant="outline">
            <a href="/admin/users/bulk/template" download>
              <Download /> Download a ready-made sheet
            </a>
          </Button>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className={cell}>Column</th>
                  <th className={cell}>Needed?</th>
                  <th className={cell}>What to write</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className={`${cell} font-medium`}>Name</td>
                  <td className={cell}>Yes</td>
                  <td className={cell}>Their full name, as others should see it.</td>
                </tr>
                <tr>
                  <td className={`${cell} font-medium`}>Email</td>
                  <td className={cell}>For people who sign in</td>
                  <td className={cell}>
                    Where their invitation goes. Someone already in Kinus (same email) is updated instead of added twice. Counselors are listed without signing in, so they don&apos;t need one (an
                    email still shows in the phone book).
                  </td>
                </tr>
                <tr>
                  <td className={`${cell} font-medium`}>Role</td>
                  <td className={cell}>No</td>
                  <td className={cell}>
                    What they can do in Kinus. You can add:
                    <ul className="mt-1 space-y-0.5">
                      {roles.map((r) => (
                        <li key={r}>
                          <strong>{STAFF_ROLES[r].label}</strong>
                          {ROLE_WORDS[r] && <span className="text-muted-foreground"> (or: {ROLE_WORDS[r]})</span>}
                        </li>
                      ))}
                    </ul>
                    Left empty, the row gets the role you pick below the paste box.
                  </td>
                </tr>
                <tr>
                  <td className={`${cell} font-medium`}>Division</td>
                  <td className={cell}>{oneDivision ? "No" : "Yes"}</td>
                  <td className={cell}>
                    {oneDivision ? (
                      <>
                        You look after <strong dir="auto">{oneDivision.name}</strong>, so leave it empty: everyone goes there.
                      </>
                    ) : (
                      <>
                        Exactly as written below. Someone in two divisions: separate with a semicolon, e.g. <code>{tree.divisions.slice(0, 2).map((d) => d.name).join("; ")}</code>.
                        {isDirector(me) && tree.groups.length > 0 && (
                          <>
                            {" "}
                            A whole camp works too ({tree.groups.map((g) => g.name).join(", ")}){isAdmin(me) ? <>, or <code>All</code> for all of camp</> : null}.
                          </>
                        )}
                      </>
                    )}
                  </td>
                </tr>
                <tr>
                  <td className={`${cell} font-medium`}>Bunk</td>
                  <td className={cell}>No</td>
                  <td className={cell}>
                    For counselors: their bunk, exactly as written below. Two bunks: separate with a semicolon (<code>Bunk Chof; Bunk Lamed</code>). Empty means the whole division (head staff, check-in
                    helpers).
                  </td>
                </tr>
                <tr>
                  <td className={`${cell} font-medium`}>Position</td>
                  <td className={cell}>No</td>
                  <td className={cell}>
                    Their job or extra role at camp, in your words: <em>Learning head</em>, <em>Waterfront</em>, <em>Night watch</em>. It shows in the phone book; it doesn&apos;t change what they can do. (No Role
                    column? Then a Position Kinus knows, like <em>Counselor</em>, is used as the role.)
                  </td>
                </tr>
                <tr>
                  <td className={`${cell} font-medium`}>Phone</td>
                  <td className={cell}>No</td>
                  <td className={cell}>For the phone book and the bunk lists, so head staff can reach them.</td>
                </tr>
                <tr>
                  <td className={`${cell} font-medium`}>Signs in</td>
                  <td className={cell}>No</td>
                  <td className={cell}>
                    <em>Yes</em> or <em>No</em>. Leave it empty for the usual: counselors are listed only (phone book, bunk lists) and don&apos;t sign in; everyone else does. Check-in phones use the
                    division&apos;s check-in login instead (on the Staff page).
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Your divisions and bunks (copy the names from here)</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {tree.divisions.map((d) => (
                <div key={d.id} className="rounded-lg border p-3 text-sm">
                  <div className="font-medium" dir="auto">
                    {d.name}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground" dir="auto">
                    {d.bunks.length ? d.bunks.map((b) => b.name).join(" · ") : "No bunks yet"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <BulkAdd roles={roles} preview={previewBulkAdd} apply={applyBulkAdd} example={example} />
    </div>
  );
}
