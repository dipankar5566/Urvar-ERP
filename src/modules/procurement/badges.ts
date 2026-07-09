export const PO_STATUS_VARIANT: Record<
  string,
  "secondary" | "outline" | "destructive" | "default"
> = {
  draft: "outline",
  approved: "default",
  partially_received: "secondary",
  closed: "secondary",
  cancelled: "destructive",
};
