"use client";
import type { AppTranslations } from "@/lib/translations";
import {
  Smartphone,
  Watch,
  BrainCog,
  Globe,
  Cloud,
  ScanEye,
  MousePointer,
  Wifi,
  Sparkles,
  Wrench,
  Gamepad2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface ExpertiseItem {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  description: string;
}

interface Props {
  t: AppTranslations;
}

const items = (t: AppTranslations): ExpertiseItem[] => [
  {
    icon: Smartphone,
    title: t.businessExpertiseIphoneTitle,
    subtitle: t.businessExpertiseIphoneSubtitle,
    description: t.businessExpertiseIphoneDescription,
  },
  {
    icon: Watch,
    title: t.businessExpertiseWatchTitle,
    subtitle: t.businessExpertiseWatchSubtitle,
    description: t.businessExpertiseWatchDescription,
  },
  {
    icon: BrainCog,
    title: t.businessExpertiseAITitle,
    subtitle: t.businessExpertiseAISubtitle,
    description: t.businessExpertiseAIDescription,
  },
  {
    icon: Globe,
    title: t.businessExpertiseWebTitle,
    subtitle: t.businessExpertiseWebSubtitle,
    description: t.businessExpertiseWebDescription,
  },
  {
    icon: Cloud,
    title: t.businessExpertiseCloudTitle,
    subtitle: t.businessExpertiseCloudSubtitle,
    description: t.businessExpertiseCloudDescription,
  },
  {
    icon: ScanEye,
    title: t.businessExpertiseArTitle,
    subtitle: t.businessExpertiseArSubtitle,
    description: t.businessExpertiseArDescription,
  },
  {
    icon: MousePointer,
    title: t.businessExpertiseAnalogTitle,
    subtitle: t.businessExpertiseAnalogSubtitle,
    description: t.businessExpertiseAnalogDescription,
  },
  {
    icon: Wifi,
    title: t.businessExpertiseIoTTitle,
    subtitle: t.businessExpertiseIoTSubtitle,
    description: t.businessExpertiseIoTDescription,
  },
  {
    icon: Sparkles,
    title: t.businessExpertiseTeamsTitle,
    subtitle: t.businessExpertiseTeamsSubtitle,
    description: t.businessExpertiseTeamsDescription,
  },
  {
    icon: Wrench,
    title: t.businessExpertiseMechanicalTitle,
    subtitle: t.businessExpertiseMechanicalSubtitle,
    description: t.businessExpertiseMechanicalDescription,
  },
  {
    icon: Gamepad2,
    title: t.businessExpertiseGameDevTitle,
    subtitle: t.businessExpertiseGameDevSubtitle,
    description: t.businessExpertiseGameDevDescription,
  },
];

const ExpertiseSection = ({ t }: Props) => (
  <section id="expertise" className="py-16 md:py-24 bg-background">
    <div className="container mx-auto px-4 md:px-6">
      <div className="text-center mb-12">
        <h2 className="font-headline text-3xl md:text-4xl font-bold text-foreground">
          {t.businessExpertiseHeading}
        </h2>
        <p className="mt-4 max-w-2xl mx-auto text-muted-foreground">
          {t.businessExpertiseIntro}
        </p>
      </div>
      <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-3">
        {items(t).map((item, idx) => (
          <div key={idx} className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center bg-muted rounded-full w-12 h-12">
                <item.icon className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-headline text-xl font-bold">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.subtitle}</p>
              </div>
            </div>
            <p className="text-muted-foreground">{item.description}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default ExpertiseSection;
