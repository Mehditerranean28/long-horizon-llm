"use client";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { GanttChartSquare, Milestone, BrainCircuit } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AppTranslations } from "@/lib/translations";

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

interface Props {
  t: AppTranslations;
}

const features = (t: AppTranslations): Feature[] => [
  {
    icon: GanttChartSquare,
    title: t.businessFeatureLongHorizonTitle,
    description: t.businessFeatureLongHorizonDescription,
  },
  {
    icon: Milestone,
    title: t.businessFeatureDeterministicTitle,
    description: t.businessFeatureDeterministicDescription,
  },
  {
    icon: BrainCircuit,
    title: t.businessFeatureOperationalTitle,
    description: t.businessFeatureOperationalDescription,
  },
];

const FeaturesSection = ({ t }: Props) => {
  return (
    <section id="features" className="py-16 md:py-24 bg-background">
      <div className="container mx-auto px-4 md:px-6">
        <div className="grid gap-8 md:grid-cols-3">
          {features(t).map((feature, index) => (
            <Card key={index} className="bg-card border-none shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader>
                <div className="flex items-center justify-center bg-muted rounded-full w-12 h-12 mb-4">
                    <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="font-headline text-xl">{feature.title}</CardTitle>
                <CardDescription className="pt-2">{feature.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
