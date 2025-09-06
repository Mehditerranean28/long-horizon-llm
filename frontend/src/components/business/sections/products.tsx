"use client";
import Image from "next/image";
import { cn, scrollToContact } from "@/utils";
import {
  Bot,
  Focus,
  ServerCog,
  Boxes,
  BriefcaseBusiness,
  BrainCog,
  Database,
  BookOpenText,
  FileText,
  FlaskConical,
  Atom,
  Satellite,
  ShieldCheck,
  LineChart,
  Car,
  Plane,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AppTranslations } from "@/lib/translations";

interface MediaItem {
  src: string;
  isVideo?: boolean;
  hint: string;
}

interface Product {
  icon: LucideIcon;
  title: string;
  description: string;
  bullets?: string[];
  media: MediaItem[];
}

interface Props {
  t: AppTranslations;
}

const products = (t: AppTranslations): Product[] => [
  {
    icon: BriefcaseBusiness,
    title: t.businessProductDigitalConsultingTitle,
    description: t.businessProductDigitalConsultingDescription,
    bullets: t.businessProductDigitalConsultingBullets,
    media: [
      { src: "/os.jpg", hint: "consulting" },
      { src: "/db.jpg", hint: "consulting infra" },
    ],
  },
  {
    icon: FileText,
    title: t.businessProductLawDocTitle,
    description: t.businessProductLawDocDescription,
    bullets: t.businessProductLawDocBullets,
    media: [
      { src: "/meeting.jpg", hint: "legal docs" },
      { src: "/HQ.jpg", hint: "hq" },
    ],
  },
  {
    icon: BrainCog,
    title: t.businessProductRagTitle,
    description: t.businessProductRagDescription,
    bullets: t.businessProductRagBullets,
    media: [
      { src: "/corporate.mp4", isVideo: true, hint: "rag pipeline" },
      { src: "/mapper.mp4", isVideo: true, hint: "rag pipeline demo" },
    ],
  },
  {
    icon: Focus,
    title: t.businessProductDecisionSupportTitle,
    description: t.businessProductDecisionSupportDescription,
    bullets: t.businessProductDecisionSupportBullets,
    media: [
      { src: "/idol.mp4", isVideo: true, hint: "strategy board" },
      { src: "/miltech.jpg", hint: "decision radar" },
    ],
  },
  {
    icon: FlaskConical,
    title: t.businessProductMedicalResearchTitle,
    description: t.businessProductMedicalResearchDescription,
    bullets: t.businessProductMedicalResearchBullets,
    media: [
      { src: "/p.mov",  isVideo: true, hint: "medical research" },
      { src: "/jolly.mp4", isVideo: true, hint: "medical ai" },
    ],
  },
  {
    icon: Bot,
    title: t.businessProductAdvancedRoboticsTitle,
    description: t.businessProductAdvancedRoboticsDescription,
    bullets: t.businessProductAdvancedRoboticsBullets,
    media: [
      { src: "/drone.png", hint: "robotics planning" },
      { src: "/robot.jpg", hint: "robotics diagram" },
    ],
  },
  {
    icon: LineChart,
    title: t.businessProductBankingTitle,
    description: t.businessProductBankingDescription,
    bullets: t.businessProductBankingBullets,
    media: [
      { src: "/bank.jpg", hint: "banking trading" },
      { src: "/intel.webp", hint: "bank data" },
    ],
  },
  {
    icon: ShieldCheck,
    title: t.businessProductMilitaryAITitle,
    description: t.businessProductMilitaryAIDescription,
    bullets: t.businessProductMilitaryAIBullets,
    media: [
      { src: "/input.gif", hint: "military ai" },
      { src: "/milly.jpg", hint: "rocket tech" },
    ],
  },
  {
    icon: ShieldCheck,
    title: t.businessProductPoliceAITitle,
    description: t.businessProductPoliceAIDescription,
    bullets: t.businessProductPoliceAIBullets,
    media: [
      { src: "/run.mp4", isVideo: true, hint: "police operations" },
      { src: "/crime.mp4", isVideo: true, hint: "investigation" },
    ],
  },
  {
    icon: ShieldCheck,
    title: t.businessProductCyberAITitle,
    description: t.businessProductCyberAIDescription,
    bullets: t.businessProductCyberAIBullets,
    media: [
      { src: "/cli.jpg", hint: "cyber security" },
      { src: "/monitor.mp4", isVideo: true ,hint: "defense" },
    ],
  },
  {
    icon: ServerCog,
    title: t.businessProductDecisionOSTitle,
    description: t.businessProductDecisionOSDescription,
    bullets: t.businessProductDecisionOSBullets,
    media: [
      { src: "/tablet.png", hint: "server room" },
      { src: "/path.jpg", hint: "operations" },
    ],
  },
  {
    icon: Boxes,
    title: t.businessProductDigitalTwinTitle,
    description: t.businessProductDigitalTwinDescription,
    bullets: t.businessProductDigitalTwinBullets,
    media: [
      { src: "/twin.mp4", isVideo: true, hint: "digital twin" },
      { src: "/industry.webp", hint: "simulation" },
    ],
  },
  {
    icon: BookOpenText,
    title: t.businessProduct3gppTitle,
    description: t.businessProduct3gppDescription,
    bullets: t.businessProduct3gppBullets,
    media: [
      { src: "/3gpp.png", hint: "3gpp" },
      { src: "/mehdi.jpg", hint: "intel" },
    ],
  },
  {
    icon: ServerCog,
    title: t.businessProductOranTitle,
    description: t.businessProductOranDescription,
    bullets: t.businessProductOranBullets,
    media: [
      { src: "/mWave.png", hint: "oran rapp" },
      { src: "/5G.svg", hint: "5g" },
    ],
  },
  {
    icon: Atom,
    title: t.businessProductQuantumTitle,
    description: t.businessProductQuantumDescription,
    bullets: t.businessProductQuantumBullets,
    media: [
      { src: "/hadron.mp4", isVideo: true, hint: "quantum research" },
      { src: "/tables.mp4", isVideo: true, hint: "quantum heatmap" },
    ],
  },
  {
    icon: Bot,
    title: t.businessProductAutomationTitle,
    description: t.businessProductAutomationDescription,
    bullets: t.businessProductAutomationBullets,
    media: [
      { src: "/bt.jpg", hint: "robotics automation" },
      { src: "/coder.png", hint: "robot" },
    ],
  },
  {
    icon: Database,
    title: t.businessProductDatabaseTitle,
    description: t.businessProductDatabaseDescription,
    bullets: t.businessProductDatabaseBullets,
    media: [
      { src: "/correlate.mp4", isVideo: true, hint: "database" },
      { src: "/doc.png", hint: "database screen" },
    ],
  },
  {
    icon: Satellite,
    title: t.businessProductNonTerrestrialTitle,
    description: t.businessProductNonTerrestrialDescription,
    bullets: t.businessProductNonTerrestrialBullets,
    media: [
      { src: "/ntn.gif", hint: "non terrestrial" },
      { src: "/sim.jpg", hint: "ntn map" },
    ],
  },
  {
    icon: BriefcaseBusiness,
    title: t.businessProductEducationTitle,
    description: t.businessProductEducationDescription,
    bullets: t.businessProductEducationBullets,
    media: [
      { src: "/cognitive robotics.png", hint: "education" },
      { src: "/heatmap.gif", hint: "training" },
    ],
  },
  {
    icon: Car,
    title: t.businessProductAutomotiveTitle,
    description: t.businessProductAutomotiveDescription,
    bullets: t.businessProductAutomotiveBullets,
    media: [
      { src: "/map_hd.jpg", hint: "self driving" },
      { src: "/car.gif", hint: "autonomous sim" },
    ],
  },
  {
    icon: Plane,
    title: t.businessProductAerospaceTitle,
    description: t.businessProductAerospaceDescription,
    bullets: t.businessProductAerospaceBullets,
    media: [
      { src: "/radar.jpg", hint: "aerospace" },
      { src: "/orbit.png", hint: "gate selection" },
    ],
  },
];

const ProductsSection = ({ t }: Props) => {
  return (
    <section id="products" className="py-8 md:py-12 bg-card">
      <div className="w-full px-0 md:px-6">
        <div className="text-center mb-12">
          <h2 className="font-headline text-3xl md:text-4xl font-bold text-foreground">
            {t.businessProductsHeading}
          </h2>
          <p className="mt-4 max-w-2xl mx-auto text-muted-foreground">
            {t.businessProductsLead}
          </p>
        </div>
        <div className="grid gap-16">
          {products(t).map((product, index) => (
            <div
              key={index}
              role="button"
              tabIndex={0}
              onClick={scrollToContact}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") scrollToContact();
              }}
              className={cn(
                "group grid gap-8 md:gap-12 md:grid-cols-2 items-center rounded-2xl border border-border p-4 md:p-8 transition hover:bg-muted/40 hover:shadow-xl hover:ring-2 hover:ring-primary/50 focus:ring-2 focus:ring-primary/50 cursor-pointer",
                index % 2 === 1 && "md:grid-flow-col-dense",
              )}
            >
              <div
                className={`space-y-4 ${index % 2 === 1 ? "md:col-start-2" : ""}`}
              >
                <div className="flex items-center gap-4">
                  <div className="flex items-center justify-center bg-muted rounded-full w-12 h-12">
                    <product.icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-headline text-2xl font-bold">
                    {product.title}
                  </h3>
                </div>
                <p className="text-muted-foreground whitespace-pre-line">
                  {product.description}
                </p>
                {product.bullets && (
                  <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
                    {product.bullets.map((bullet, i) => (
                      <li key={i}>{bullet}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div
                className={cn(
                  "grid gap-4 md:grid-cols-2",
                  index % 2 === 1 && "md:col-start-1",
                )}
              >
                {product.media.map((m, i) => (
                  <div
                    key={i}
                    className="overflow-hidden rounded-lg shadow-lg transition-shadow group-hover:shadow-2xl"
                  >
                    {m.isVideo ? (
                      <video
                        src={m.src}
                        className="w-full h-auto object-cover"
                        autoPlay
                        loop
                        muted
                        playsInline
                        data-ai-hint={m.hint}
                      />
                    ) : (
                      <Image
                        src={m.src}
                        alt={product.title}
                        width={1200}
                        height={800}
                        className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-105"
                        data-ai-hint={m.hint}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ProductsSection;
