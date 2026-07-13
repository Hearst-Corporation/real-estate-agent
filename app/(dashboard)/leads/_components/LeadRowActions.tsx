"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EllipsisHorizontalIcon } from "@heroicons/react/16/solid";
import { Dropdown, DropdownButton, DropdownMenu, DropdownItem } from "@/components/ui/dropdown";
import { Dialog, DialogTitle, DialogBody } from "@/components/ui/dialog";
import { Text } from "@/components/ui/text";
import { UI } from "@/lib/ui-strings";
import { isEnrichable } from "@/lib/crm/enrichable";
import { LeadForm, type LeadDefaults } from "./LeadForm";

type LeadRowActionsProps = {
  id: string;
  fullName: string;
  defaultValues: LeadDefaults;
};

/** Actions d'une ligne lead : Modifier (modale) + Enrichir + Supprimer. */
export function LeadRowActions({ id, fullName, defaultValues }: LeadRowActionsProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const canEnrich = isEnrichable(defaultValues.type_personne);

  async function handleDelete() {
    if (!confirm(`${UI.leads.delete} « ${fullName} » ?`)) return;
    setDeleting(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/leads/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setMessage(UI.common.httpError(res.status));
        return;
      }
      router.refresh();
    } catch {
      setMessage(UI.common.networkError);
    } finally {
      setDeleting(false);
    }
  }

  async function handleEnrich() {
    if (!canEnrich) return;
    if (!confirm(UI.leads.enrichConsent)) return;

    setEnriching(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/leads/${id}/enrich`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true }),
      });
      const json = (await res.json().catch(() => ({}))) as { enriched?: boolean; error?: string };

      if (!res.ok) {
        setMessage(UI.leads.enrichErrors[json.error ?? ""] ?? UI.common.httpError(res.status));
        return;
      }

      setMessage(json.enriched ? UI.leads.enrichDone : UI.leads.enrichNoData);
      router.refresh();
    } catch {
      setMessage(UI.common.networkError);
    } finally {
      setEnriching(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {message ? <Text className="text-xs">{message}</Text> : null}

      <Dropdown>
        <DropdownButton plain aria-label={UI.viz.edit} disabled={deleting || enriching}>
          <EllipsisHorizontalIcon />
        </DropdownButton>
        <DropdownMenu anchor="bottom end">
          <DropdownItem onClick={() => setEditing(true)}>{UI.viz.edit}</DropdownItem>
          {canEnrich ? (
            <DropdownItem onClick={handleEnrich}>
              {enriching ? UI.leads.enriching : UI.leads.enrich}
            </DropdownItem>
          ) : null}
          <DropdownItem onClick={handleDelete}>
            {deleting ? UI.common.busy : UI.viz.delete}
          </DropdownItem>
        </DropdownMenu>
      </Dropdown>

      <Dialog open={editing} onClose={setEditing}>
        <DialogTitle>Modifier le lead</DialogTitle>
        <DialogBody>
          <LeadForm id={id} defaultValues={defaultValues} onClose={() => setEditing(false)} />
        </DialogBody>
      </Dialog>
    </div>
  );
}
