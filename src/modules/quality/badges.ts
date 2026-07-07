export const LOT_QC_BADGE: Record<
  string,
  { label: string; variant: "secondary" | "default" | "destructive" | "outline" }
> = {
  pending: { label: "Inspection Pending", variant: "outline" },
  accepted: { label: "Accepted", variant: "secondary" },
  rejected: { label: "Rejected", variant: "destructive" },
};

export const CAPA_STATUS_BADGE: Record<
  string,
  { label: string; variant: "secondary" | "default" | "destructive" | "outline" }
> = {
  open: { label: "Open", variant: "outline" },
  in_progress: { label: "In Progress", variant: "default" },
  verification: { label: "Verification", variant: "secondary" },
  closed: { label: "Closed", variant: "secondary" },
};
