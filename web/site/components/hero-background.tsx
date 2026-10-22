import { SignalField } from "@/components/signal-field";
import { site } from "@/lib/site";
import "./signal-field.css";

export function HeroBackground() {
  return (
    <div className="hero-backdrop">
      <SignalField publicHost={`your-app.${site.tunnelDomain}`} />
    </div>
  );
}
