"use client";
import { useState } from "react";
import { Crown, Store, Truck, Wrench, type LucideIcon } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Modal } from "@/components/modal";
import { staffAction } from "@/lib/staff/actions";

export type RoleChoice = { value: string; label: string; summary: string };

const ICONS: Record<string, LucideIcon> = { delivery: Truck, admin: Store, "super-admin": Crown, tech: Wrench };

/**
 * One account in "Add a staff member": an Add button that opens a sheet with the roles, each
 * explained in a line, and one "Add to team". The sheet is the confirming step, so there is no
 * second "Are you sure?". Delivery partner, the least power, starts picked.
 */
export function AddToTeam({
  person,
  roles,
}: {
  /** `contact` is their phone and email in full: the row cuts a long one short on a small phone. */
  person: { id: string; name: string; contact?: string };
  roles: RoleChoice[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="secondary-button compact-button staff-picker-add"
        aria-label={`Add ${person.name} to the team`}
        onClick={() => setOpen(true)}
      >
        Add
      </button>
      {open && (
        <Modal title={`Add ${person.name} as`} onClose={() => setOpen(false)}>
          {person.contact && <p className="role-sheet-contact">{person.contact}</p>}
          <ActionForm action={staffAction} submit="Add to team" className="role-sheet">
            <input type="hidden" name="operation" value="grant" />
            <input type="hidden" name="userId" value={person.id} />
            <fieldset className="role-choices">
              <legend className="sr-only">Role for {person.name}</legend>
              {roles.map((role, index) => {
                const Icon = ICONS[role.value];
                return (
                  <label key={role.value}>
                    <input type="radio" name="role" value={role.value} defaultChecked={index === 0} required />
                    {Icon && <Icon size={18} aria-hidden="true" />}
                    <span>
                      <strong>{role.label}</strong>
                      <small>{role.summary}</small>
                    </span>
                  </label>
                );
              })}
            </fieldset>
          </ActionForm>
        </Modal>
      )}
    </>
  );
}
