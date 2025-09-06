"use client";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { AppTranslations } from "@/lib/translations";

interface Props {
  t: AppTranslations;
}

const steps = (t: AppTranslations) => [
  {
    title: t.businessProcessDiscoveryTitle,
    description: t.businessProcessDiscoveryDescription,
  },
  {
    title: t.businessProcessPlanningTitle,
    description: t.businessProcessPlanningDescription,
  },
  {
    title: t.businessProcessDesignTitle,
    description: t.businessProcessDesignDescription,
  },
  {
    title: t.businessProcessDevelopmentTitle,
    description: t.businessProcessDevelopmentDescription,
  },
  {
    title: t.businessProcessTestingTitle,
    description: t.businessProcessTestingDescription,
  },
  {
    title: t.businessProcessMaintenanceTitle,
    description: t.businessProcessMaintenanceDescription,
  },
];

const ProcessSection = ({ t }: Props) => {
  return (
    <section id="process" className="py-16 md:py-24 bg-background">
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center mb-12">
          <h2 className="font-headline text-3xl md:text-4xl font-bold">
            {t.businessProcessHeading}
          </h2>
          <p className="mt-4 max-w-2xl mx-auto text-muted-foreground">
            {t.businessProcessLead}
          </p>
        </div>
        <div className="grid gap-8 md:grid-cols-3">
          {steps(t).map((step, index) => (
            <Card key={index} className="bg-card border-none shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-center bg-muted rounded-full w-10 h-10 mb-4">
                  <span className="font-headline font-bold text-lg">{index + 1}</span>
                </div>
                <CardTitle className="font-headline text-xl">{step.title}</CardTitle>
                <CardDescription className="pt-2">{step.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ProcessSection;
