export const QC_BADGE: Record<
  string,
  { label: string; variant: "secondary" | "default" | "destructive" | "outline" }
> = {
  pending: { label: "QC Pending", variant: "outline" },
  released: { label: "Released", variant: "secondary" },
  hold: { label: "On Hold", variant: "destructive" },
};
