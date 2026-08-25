import Link from "next/link";
import { Brand } from "@/components/brand";
import { useRouter } from "next/navigation";

export function AppHeader({ label }: { label?: string }) {
  const router = useRouter();
  return <header className="app-header"><div className="shell"><Brand/><div><span className="status-dot"/>{label||"Evidence engine"}</div>
    {label && (
      <button
        className="toolbar-button small"
        onClick={() => {
          router.replace("/");
          // Could also add room disconnect logic here
        }}
      >
        Leave
      </button>
    )}
    <Link className="back-link" href="/">← New source</Link></div></header>;
}
