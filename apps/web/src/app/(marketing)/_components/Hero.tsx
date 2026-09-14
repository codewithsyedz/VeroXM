"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ChevronRight, CirclePlay, FileText, Layers3, MousePointer2, Sparkles } from "lucide-react";

interface HeroProps {
  tagline: string;
  heading1: string;
  heading2: string;
  subheading: string;
  exploreLabel: string;
  bookDemoLabel: string;
}

// Ported from ../../../../../veroxm-obsidian-atelier's InteractiveHero.tsx
// (the "console" scene) -- recolored to the dashboard's sapphire palette
// and simplified to one real, CMS-driven scene instead of that
// prototype's four rotating brand presets, which don't apply here.
export function Hero({ tagline, heading1, heading2, subheading, exploreLabel, bookDemoLabel }: HeroProps) {
  const stageRef = useRef<HTMLElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const [enhanced, setEnhanced] = useState(false);

  useEffect(() => {
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const evaluate = () => setEnhanced(finePointer.matches && !reducedMotion.matches && !connection?.saveData);
    evaluate();
    finePointer.addEventListener("change", evaluate);
    reducedMotion.addEventListener("change", evaluate);
    return () => {
      finePointer.removeEventListener("change", evaluate);
      reducedMotion.removeEventListener("change", evaluate);
    };
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !enhanced) return;
    const renderPointer = () => {
      frameRef.current = null;
      const { x, y } = pointerRef.current;
      const rect = stage.getBoundingClientRect();
      const normalizedX = (x - rect.left) / rect.width - 0.5;
      const normalizedY = (y - rect.top) / rect.height - 0.5;
      if (sceneRef.current) sceneRef.current.style.transform = `translate3d(${normalizedX * 18}px, ${normalizedY * 12}px, 0) rotateX(${normalizedY * -2.6}deg) rotateY(${normalizedX * 3.8}deg)`;
      if (glowRef.current) glowRef.current.style.transform = `translate3d(${normalizedX * 42}px, ${normalizedY * 28}px, 0)`;
      if (cursorRef.current) cursorRef.current.style.transform = `translate3d(${x - 19}px, ${y - 19}px, 0)`;
    };
    const onPointerMove = (event: PointerEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
      if (!frameRef.current) frameRef.current = window.requestAnimationFrame(renderPointer);
    };
    const onPointerEnter = () => cursorRef.current?.classList.add("is-visible");
    const onPointerLeave = () => cursorRef.current?.classList.remove("is-visible");
    stage.addEventListener("pointermove", onPointerMove);
    stage.addEventListener("pointerenter", onPointerEnter);
    stage.addEventListener("pointerleave", onPointerLeave);
    return () => {
      stage.removeEventListener("pointermove", onPointerMove);
      stage.removeEventListener("pointerenter", onPointerEnter);
      stage.removeEventListener("pointerleave", onPointerLeave);
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
    };
  }, [enhanced]);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  return (
    <section ref={stageRef} className={`veroxm-hero ${enhanced ? "is-enhanced" : ""}`} aria-labelledby="hero-title">
      <div className="hero-ambient hero-ambient-one" aria-hidden="true" />
      <div ref={glowRef} className="hero-pointer-glow" aria-hidden="true" />
      <div className="hero-mesh" aria-hidden="true" />
      <div className="hero-cursor" ref={cursorRef} aria-hidden="true"><span /></div>

      <div className="container hero-layout">
        <div className="hero-copy">
          <div className="hero-eyebrow hero-reveal hero-reveal-1">
            <span className="hero-live-dot" aria-hidden="true" />
            <span>{tagline}</span>
          </div>
          <h1 id="hero-title" className="hero-title hero-reveal hero-reveal-2">
            {heading1}
            <br />
            <span>{heading2}</span>
          </h1>
          <p className="hero-description hero-reveal hero-reveal-3">{subheading}</p>
          <div className="hero-actions hero-reveal hero-reveal-4">
            <button type="button" onClick={() => scrollTo("book-a-demo")} className="hero-primary-action">
              {bookDemoLabel} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => scrollTo("features")} className="hero-secondary-action">
              <CirclePlay className="h-4 w-4" aria-hidden="true" />
              {exploreLabel}
            </button>
          </div>
          <p className="hero-trust hero-reveal hero-reveal-5">Structured content · Governed access · Built for ambitious teams</p>
        </div>

        <div ref={sceneRef} className="hero-console-scene hero-reveal hero-reveal-scene" aria-hidden="true">
          <div className="hero-orbit hero-orbit-a" />
          <div className="hero-orbit hero-orbit-b" />
          <div className="hero-console-shadow" />
          <div className="hero-console">
            <div className="console-topline">
              <div><span className="console-kicker">VEROXM WORKSPACE</span><strong>veroXM Landing</strong></div>
              <span className="console-live"><i /> LIVE</span>
            </div>
            <div className="console-rule" />
            <div className="console-metrics">
              <div><span>CONTENT</span><strong>83</strong><em><ChevronRight className="h-2.5 w-2.5" /> +6 this week</em></div>
              <div><span>COLLECTIONS</span><strong>31</strong><em><ChevronRight className="h-2.5 w-2.5" /> Active</em></div>
              <div><span>LOCALES</span><strong>EN</strong><em><ChevronRight className="h-2.5 w-2.5" /> Synced</em></div>
              <div><span>WORKFLOW</span><strong>Live</strong><em><ChevronRight className="h-2.5 w-2.5" /> On track</em></div>
            </div>
            <div className="console-entry">
              <span className="entry-index">01</span>
              <div><strong>veroXM Landing</strong><small>Marketing site / just now</small></div>
              <span className="entry-status"><i /> Ready</span>
            </div>
          </div>
          <div className="hero-float-card hero-float-left"><Layers3 className="h-4 w-4" /><span><strong>Model aligned</strong><small>18 fields verified</small></span><Check className="hero-success-icon ml-auto h-4 w-4" /></div>
          <div className="hero-float-card hero-float-right"><Sparkles className="h-4 w-4" /><span><strong>Publishing queued</strong><small>1 locale in sync</small></span></div>
          <div className="hero-float-card hero-float-bottom"><FileText className="h-4 w-4" /><span><strong>New editorial brief</strong><small>Homepage / 2 min ago</small></span></div>
          <div className="scene-pulse scene-pulse-one" />
          <div className="scene-pulse scene-pulse-two" />
        </div>
      </div>

      <div className="hero-bottom-rail container hero-reveal hero-reveal-5">
        <button type="button" onClick={() => scrollTo("features")} className="hero-rail-item"><span>01</span><strong>Model your content</strong><ArrowRight className="h-4 w-4" /></button>
        <button type="button" onClick={() => scrollTo("cms")} className="hero-rail-item"><span>02</span><strong>Publish with clarity</strong><ArrowRight className="h-4 w-4" /></button>
        <button type="button" onClick={() => scrollTo("faqs")} className="hero-rail-item"><span>03</span><strong>Govern the system</strong><ArrowRight className="h-4 w-4" /></button>
      </div>
      <div className="hero-scroll-cue" aria-hidden="true"><MousePointer2 className="h-3.5 w-3.5" /><span>Move to explore</span></div>
    </section>
  );
}
