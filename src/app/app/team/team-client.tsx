"use client";

import { useActionState, useEffect, useState } from "react";
import { Pencil, UserPlus } from "lucide-react";
import type { User } from "@/lib/db/schema";
import { Modal, useAction, useFormResult } from "@/components/client";
import { saveUserAction, toggleUserAction } from "../actions";

export function UserForm({ user }: { user?: Omit<User, "passwordHash"> & { passwordHash?: undefined } }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(saveUserAction, undefined);
  const onResult = useFormResult();
  useEffect(() => {
    onResult(state);
    if (state?.ok) setOpen(false);
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      {user ? <button className="btn-ghost px-2" onClick={() => setOpen(true)}><Pencil className="h-4 w-4" /></button> : <button className="btn-primary" onClick={() => setOpen(true)}><UserPlus className="h-4 w-4" /> Add member</button>}
      <Modal open={open} onClose={() => setOpen(false)} title={user ? `Edit ${user.name}` : "Add a team member"}>
        <form action={action} className="grid gap-3 sm:grid-cols-2">
          {user && <input type="hidden" name="id" value={user.id} />}
          <div><label className="label">Name</label><input name="name" required defaultValue={user?.name} className="input" /></div>
          <div><label className="label">Email</label><input name="email" type="email" required defaultValue={user?.email} className="input" /></div>
          <div><label className="label">{user ? "New password (optional)" : "Password"}</label><input name="password" type="password" className="input" /></div>
          <div><label className="label">Phone</label><input name="phone" defaultValue={user?.phone ?? ""} className="input" /></div>
          <div>
            <label className="label">Role</label>
            <select name="role" defaultValue={user?.role ?? "AGENT"} className="input">
              <option value="AGENT">Agent (confirmer)</option>
              <option value="MANAGER">Manager</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <div><label className="label">Color</label><input name="color" type="color" defaultValue={user?.color ?? "#3370fa"} className="h-10 w-full rounded-xl border border-slate-200" /></div>
          <div><label className="label">Assignment weight</label><input name="assignmentWeight" type="number" min={0} defaultValue={user?.assignmentWeight ?? 10} className="input" /></div>
          <div />
          <div><label className="label">Commission / confirmed</label><input name="commissionConfirmed" type="number" min={0} defaultValue={user?.commissionConfirmed ?? 5} className="input" /></div>
          <div><label className="label">Commission / delivered</label><input name="commissionDelivered" type="number" min={0} defaultValue={user?.commissionDelivered ?? 5} className="input" /></div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function UserToggle({ id, active }: { id: number; active: boolean }) {
  const { pending, run } = useAction();
  return <button disabled={pending} className="btn-ghost px-2 text-xs" onClick={() => run(() => toggleUserAction(id, !active))}>{active ? "Disable" : "Enable"}</button>;
}
