import { Badge } from "@/components/ui/Badge";

export function ThreadStatusBadge({ status, viewer }: { status: string; viewer: "client" | "admin" }) {
  if (status === "closed") return <Badge tone="stone">Closed</Badge>;
  if (status === "answered") return <Badge tone="green">{viewer === "client" ? "We replied" : "Answered"}</Badge>;
  return <Badge tone="amber">{viewer === "client" ? "Waiting on us" : "Needs reply"}</Badge>;
}
