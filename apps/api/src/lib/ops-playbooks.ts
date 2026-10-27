/**
 * OPS-PLAYBOOKS — catalog of support runbooks linked from admin.
 * Paths are repo-relative; operators open them in git / docs site.
 */

export type OpsPlaybook = {
  id: "parser-breakage" | "refund-disputes" | "data-deletion";
  title: string;
  path: string;
  summary: string;
};

export const OPS_PLAYBOOKS: readonly OpsPlaybook[] = [
  {
    id: "parser-breakage",
    title: "Merchant parser breakage",
    path: "docs/playbooks/parser-breakage.md",
    summary:
      "Wrong merchant/amount after email/SMS/receipt sync; correct flow, reconcile, parser fixtures.",
  },
  {
    id: "refund-disputes",
    title: "Refund disputes",
    path: "docs/playbooks/refund-disputes.md",
    summary:
      "Return marked wrong vs merchant payout; refund-ETA board + ledger; WORN is not merchant of record.",
  },
  {
    id: "data-deletion",
    title: "Data-deletion requests / SLAs",
    path: "docs/playbooks/data-deletion.md",
    summary:
      "Export + hard-delete (DELETE /vault), retention TTLs, support-assisted erasure SLAs.",
  },
] as const;
