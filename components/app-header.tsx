import Link from "next/link";
import { Brand } from "@/components/brand";

export function AppHeader({ label }: { label?: string }) {
  return <header className="app-header"><div className="shell"><Brand/><div><span className="status-dot"/>{label||"Evidence engine"}</div><Link className="back-link" href="/">← New source</Link></div></header>;
}
