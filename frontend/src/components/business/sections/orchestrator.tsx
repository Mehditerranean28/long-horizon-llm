"use client";
import type { AppTranslations } from "@/lib/translations";

interface Props {
  t: AppTranslations;
}

const OrchestratorSection = (_: Props) => {
  return (
    <section id="orchestrator" className="w-full h-screen">
      <video
        className="w-full h-full object-cover"
        src="/p.mov"
        autoPlay
        muted
        loop
        playsInline
      />
    </section>
  );
};

export default OrchestratorSection;
