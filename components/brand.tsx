import Image from "next/image";
import Link from "next/link";

export function Brand() {
  return <Link className="brand" href="/" aria-label="CivicLens home">
    <Image className="brand-logo" src="/brand/icon.png" alt="" width={42} height={42} priority/>
    <span>Civic<span className="brand-accent">Lens</span></span>
  </Link>;
}
