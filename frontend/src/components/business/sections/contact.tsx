"use client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import ContactForm from "../contact-form";
import Image from "next/image";
import type { AppTranslations } from "@/lib/translations";

interface Props {
  t: AppTranslations;
}
const ContactSection = ({ t }: Props) => {
  return (
    <section id="contact" className="py-16 md:py-24 bg-card">
      <div className="container mx-auto px-4 md:px-6">
        <Card className="overflow-hidden">
          <div className="grid md:grid-cols-2">
            <div className="p-8 md:p-12">
              <CardHeader className="p-0">
                <CardTitle className="font-headline text-3xl font-bold">{t.businessContactHeading}</CardTitle>
                <CardDescription className="mt-2 text-base">
                  {t.businessContactDescription}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0 mt-6">
                <ContactForm t={t} />
              </CardContent>
            </div>
            <div className="hidden md:flex flex-col relative w-full h-full">
              <div className="relative w-full h-1/2">
                <Image
                  src="/wavy.png"
                  alt="Wavy background"
                  fill
                  className="object-cover"
                  data-ai-hint="wavy"
                />
              </div>
              <div className="relative w-full h-1/2">
                <Image
                  src="/zima.jpg"
                  alt="Zima image"
                  fill
                  className="object-cover"
                  data-ai-hint="zima"
                />
              </div>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
};

export default ContactSection;
