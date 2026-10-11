import TunnelHero from "@/components/ui/tunnel-hero";

// The hero keeps a plain, theme-matched background until WebGL is ready.
export function HeroBackground() {
  return (
    <div className="hero-backdrop" aria-hidden="true">
      <TunnelHero />
      <div className="hero-tunnel-shade" />
    </div>
  );
}
