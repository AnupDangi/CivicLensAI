import { SiteHeader } from "@/components/site-header";
import { UrlAnalyzer } from "@/components/url-analyzer";
import { LandingStats, RecentSources } from "@/components/landing-stats";

const sourceItems = [
  ["▶", "YouTube"],
  ["𝕏", "X posts"],
  ["◎", "Instagram"],
  ["f", "Facebook"],
  ["↟", "Reddit"],
  ["♪", "TikTok"],
  ["¶", "Articles"],
  ["⌁", "Public pages"],
];

export default async function Home() {
  return <main>
    <SiteHeader/>
    <section className="hero">
      <div className="shell hero-grid">
        <div className="hero-content">
          <span className="eyebrow">Evidence before certainty</span>
          <h1>See the claim.<br/><em>Trace the evidence.</em></h1>
          <p className="hero-copy">Paste one public link. CivicLens detects every language automatically, reads captions and media, and shows the evidence behind each assessment.</p>
          <UrlAnalyzer/>
          <div className="analyzer-meta"><span>No account required</span><span>No language setup</span><span>Primary sources first</span></div>
        </div>
        <aside className="hero-signal" aria-label="CivicLens live pipeline">
          <span className="hero-signal-label"><i/> LIVE PIPELINE</span>
          <div className="signal-orbit"><span className="signal-core">CL</span><span className="orbit-node node-one">ने</span><span className="orbit-node node-two">ع</span><span className="orbit-node node-three">ES</span></div>
          <div className="signal-row"><span>01</span><strong>Capture speech + media</strong><small>automatic</small></div>
          <div className="signal-row"><span>02</span><strong>Detect claim language</strong><small>per segment</small></div>
          <div className="signal-row"><span>03</span><strong>Retrieve evidence</strong><small>cited</small></div>
        </aside>
      </div>
    </section>

    <section className="source-strip" aria-label="Supported sources"><div className="shell">{sourceItems.map(([icon,label]) => <div className="source-item" key={label}><span className="source-icon" aria-hidden="true">{icon}</span><strong>{label}</strong></div>)}</div></section>

    <LandingStats />
    <section className="section" id="recent">
      <div className="shell">
        <div className="section-heading">
        <div><span className="eyebrow">Recent civic rooms</span><h2>What the community is checking</h2></div><p>Every checked public link has a shareable room for evidence, discussion, camera, and browser-tab video/audio.</p>
        </div>
        <RecentSources />
      </div>
    </section>

    <section className="section section-dark" id="method"><div className="shell">
      <div className="section-heading"><div><span className="eyebrow eyebrow-light">How it works</span><h2>From statement<br/>to source.</h2></div><p>CivicLens does not ask a model to guess what is true. It separates extraction, multilingual retrieval, and evidence assessment into visible steps.</p></div>
      <div className="steps">
        <article className="step"><span className="step-number">01 / CAPTURE</span><h3>Read every layer</h3><p>Text, captions, images, linked pages, speech, and video frames become a transparent coverage manifest.</p></article>
        <article className="step"><span className="step-number">02 / RETRIEVE</span><h3>Search locally</h3><p>Queries run in each claim’s own language and English, with official sources matched to jurisdiction.</p></article>
        <article className="step"><span className="step-number">03 / ASSESS</span><h3>Show the trail</h3><p>Verdicts require cited evidence. Missing evidence becomes a limitation—not an invented answer.</p></article>
      </div>
    </div></section>

    <section className="section demo-section" id="demo"><div className="shell demo-grid">
      <div className="demo-copy"><span className="eyebrow">Live Civic Room</span><h2>Open the source.<br/>See checks arrive.</h2><p>Every public link maps to one persistent room. YouTube supports host playback controls; articles and social links can be opened in a tab and shared with video/audio.</p><ul className="feature-checks"><li>Automatic transcript language detection</li><li>Evidence cards update inside the room</li><li>Voice, opt-in video, chat, and shared browser tabs</li></ul><a className="text-link" href="#analyze">Open a civic room →</a></div>
      <div className="demo-player"><video controls playsInline preload="metadata" poster="/demo/civiclens-room.png"><source src="/demo/civiclens-walkthrough.mp4" type="video/mp4"/>Your browser does not support the demo video.</video><div className="demo-caption"><span><i/> PRODUCT WALKTHROUGH</span><small>Recorded from the local production build</small></div></div>
    </div></section>

    <section className="section trust-section" id="trust"><div className="shell">
      <div className="section-heading"><div><span className="eyebrow">Trust model</span><h2>A fact-check<br/>you can inspect.</h2></div><p>Confidence is not presented as a truth probability. CivicLens reports evidence strength, primary-source availability, and why each source was selected.</p></div>
      <div className="trust-grid">
        <article className="trust-card"><span className="eyebrow">Source order</span><h3>Authority is part of the answer.</h3><ul className="tier-list"><li><span className="tier-number">1</span><strong>Primary government</strong><span className="tier-tag">laws · data</span></li><li><span className="tier-number">2</span><strong>Primary institution</strong><span className="tier-tag">courts · science</span></li><li><span className="tier-number">3</span><strong>Professional fact-checker</strong><span className="tier-tag">prior reviews</span></li><li><span className="tier-number">4</span><strong>Reputable reporting</strong><span className="tier-tag">context</span></li></ul></article>
        <article className="trust-card language-card" id="languages"><span className="eyebrow">Automatic language</span><h3>No selector. No allowlist.</h3><p>Every transcript segment and claim is detected independently. Original wording stays visible; evidence retrieval expands into local official languages and English.</p><div className="language-cloud"><span>नेपाली</span><span>हिन्दी</span><span>English</span><span>العربية</span><span>Español</span><span>中文</span><span>+ any Unicode</span></div></article>
      </div>
    </div></section>

    <section className="section final-cta"><div className="shell"><div><span className="eyebrow eyebrow-light">Open evidence</span><h2>Bring the link.<br/>CivicLens handles the language.</h2></div><a className="primary-button" href="#analyze">Analyze a source →</a></div></section>
    <footer className="site-footer"><div className="shell footer-inner"><span>© 2026 CivicLens</span><span>Watch together. Verify with evidence.</span></div></footer>
  </main>;
}
