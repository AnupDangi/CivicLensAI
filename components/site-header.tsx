import { Brand } from "@/components/brand";

export function SiteHeader() { return <header className="shell site-header"><Brand /><nav className="top-nav" aria-label="Primary navigation"><a href="#method">Method</a><a href="#demo">Demo</a><a href="#trust">Trust model</a><a className="header-cta" href="#analyze">Check a source</a></nav></header>; }
