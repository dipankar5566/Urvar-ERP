export const QC_BADGE: Record<
  string,
  { label: string; variant: "secondary" | "default" | "destructive" | "outline" }
> = {
  pending: { label: "QC Pending", variant: "outline" },
  sample_collected: { label: "Sample Collected", variant: "outline" },
  testing: { label: "Testing", variant: "default" },
  released: { label: "Released", variant: "secondary" },
  hold: { label: "On Hold", variant: "destructive" },
};
