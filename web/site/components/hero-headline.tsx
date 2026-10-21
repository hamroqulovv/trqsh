import { AnimatedText } from "@/components/animated-text";

export function HeroHeadline() {
  return (
    <h1 className="hero-headline font-semibold leading-[1.06] tracking-[-0.065em]">
      <AnimatedText
        text="Your localhost."
        className="hero-title-line"
        split="chars"
        delay={180}
      />
      {" "}
      <AnimatedText
        text="Now everywhere."
        className="hero-title-line hero-title-accent"
        split="chars"
        delay={400}
      />
    </h1>
  );
}
