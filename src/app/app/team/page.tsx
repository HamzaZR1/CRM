import { db, t } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { loadDataset, rangeFromParam, teamPerformance } from "@/lib/services/analytics";
import { Avatar, Badge, Bar, PageHeader, RangeTabs } from "@/components/ui";
import { money, pct } from "@/lib/utils";
import { UserForm, UserToggle } from "./team-client";

export const metadata = { title: "Team" };

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const me = await requireUser(["ADMIN", "MANAGER"]);
  const range = rangeFromParam((await searchParams).range);
  const [users, ds, settings] = await Promise.all([db.select().from(t.users), loadDataset(range), getSettings()]);
  const perf = new Map(teamPerformance(ds).map((p) => [p.id, p]));
  const cur = settings.company.currency;
  const totalWeight = users.filter((u) => u.role === "AGENT" && u.active).reduce((s, u) => s + u.assignmentWeight, 0);

  return (
    <>
      <PageHeader title="Team" subtitle="Confirmers, managers and admins — with their real performance and commissions." actions={<><RangeTabs current={range.key} base="/app/team" />{me.role === "ADMIN" && <UserForm />}</>} />
      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead><tr><th>Member</th><th>Role</th><th>Share of orders</th><th>Orders</th><th>Confirmation</th><th>Delivery</th><th>Commission rule</th><th>Earned</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => {
              const p = perf.get(u.id);
              return (
                <tr key={u.id} className={u.active ? "" : "opacity-50"}>
                  <td><div className="flex items-center gap-3"><Avatar name={u.name} color={u.color} /><div><div className="font-semibold">{u.name}</div><div className="text-xs text-slate-500">{u.email}</div></div></div></td>
                  <td><Badge tone={u.role === "ADMIN" ? "violet" : u.role === "MANAGER" ? "blue" : "slate"}>{u.role}</Badge></td>
                  <td>{u.role === "AGENT" ? <span className="font-semibold">{pct(totalWeight && u.active ? u.assignmentWeight / totalWeight : 0)}</span> : "—"}</td>
                  <td>{p?.orders ?? "—"}</td>
                  <td>{p ? <div className="flex items-center gap-2"><Bar value={p.confirmationRate} className="w-16" />{pct(p.confirmationRate)}</div> : "—"}</td>
                  <td>{p ? <div className="flex items-center gap-2"><Bar value={p.deliveryRate} className="w-16" />{pct(p.deliveryRate)}</div> : "—"}</td>
                  <td className="text-xs text-slate-600">{u.role === "AGENT" ? `${u.commissionConfirmed} / confirmed · ${u.commissionDelivered} / delivered` : "—"}</td>
                  <td className="font-semibold">{p ? money(p.commission, cur) : "—"}</td>
                  <td>{me.role === "ADMIN" && <div className="flex justify-end gap-1"><UserForm user={{ ...u, passwordHash: undefined }} /><UserToggle id={u.id} active={u.active} /></div>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
