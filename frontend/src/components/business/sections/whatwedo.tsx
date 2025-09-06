"use client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import type { AppTranslations } from "@/lib/translations";

interface Props {
  t: AppTranslations;
}

interface Item {
  title: string;
  paragraphs: string[];
}

const items = (t: AppTranslations): Item[] => [
  {
    title: t.businessWhatStrategyTitle,
    paragraphs: [t.businessWhatStrategyParagraph1, t.businessWhatStrategyParagraph2],
  },
  {
    title: t.businessWhatDesignTitle,
    paragraphs: [t.businessWhatDesignParagraph1, t.businessWhatDesignParagraph2],
  },
  {
    title: t.businessWhatDevelopmentTitle,
    paragraphs: [t.businessWhatDevelopmentParagraph1, t.businessWhatDevelopmentParagraph2],
  },
  {
    title: t.businessWhatLabsTitle,
    paragraphs: [t.businessWhatLabsParagraph1, t.businessWhatLabsParagraph2],
  },
  {
    title: t.businessWhatContinuityTitle,
    paragraphs: [t.businessWhatContinuityParagraph1, t.businessWhatContinuityParagraph2],
  },
  {
    title: t.businessWhatWorkingTitle,
    paragraphs: [t.businessWhatWorkingParagraph1, t.businessWhatWorkingParagraph2],
  },
];

const WhatWeDoSection = ({ t }: Props) => {
  return (
    <section id="what-we-do" className="py-16 md:py-24 bg-background">
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center mb-12">
          <h2 className="font-headline text-3xl md:text-4xl font-bold">
            {t.businessWhatHeading}
          </h2>
          <p className="mt-4 max-w-2xl mx-auto text-muted-foreground">
            {t.businessWhatLead}
          </p>
        </div>
        <div className="what-runway overflow-hidden">
          <div className="what-slider flex gap-6 pb-2">
            {items(t)
              .concat(items(t))
              .map((item, idx) => (
              <Card
                key={idx}
                className="what-card bg-card border-none shadow-lg w-80 md:w-96 flex-none"
              >
                <CardHeader>
                  <CardTitle className="font-headline text-2xl">
                    {item.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-2">
                  {item.paragraphs.map((p, i) => (
                    <p key={i} className="text-muted-foreground">
                      {p}
                    </p>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default WhatWeDoSection;
