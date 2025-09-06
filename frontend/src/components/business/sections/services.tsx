"use client";
import Image from "next/image";
import type { AppTranslations } from "@/lib/translations";
import { scrollToContact } from "@/utils";

interface Media {
  src: string;
  isVideo?: boolean;
  hint?: string;
}

interface ServiceItem {
  title: string;
  bullets: string[];
  media: Media;
}

interface Props {
  t: AppTranslations;
}

const ServiceCard = ({ title, bullets, media }: ServiceItem) => (
  <div
    role="button"
    tabIndex={0}
    onClick={scrollToContact}
    onKeyDown={(e) => {
      if (e.key === "Enter" || e.key === " ") scrollToContact();
    }}
    className="group grid gap-8 md:gap-12 md:grid-cols-2 items-center rounded-2xl border border-border p-4 md:p-8 transition hover:bg-muted/40 hover:shadow-xl hover:ring-2 hover:ring-primary/50 focus:ring-2 focus:ring-primary/50 cursor-pointer"
  >
    <div className="space-y-4">
      <h3 className="font-headline text-xl font-semibold">{title}</h3>
      <ul className="space-y-1 list-disc list-inside text-muted-foreground">
        {bullets.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>
    </div>
    <div className="overflow-hidden rounded-lg shadow-lg">
      {media.isVideo ? (
        <video
          src={media.src}
          muted
          autoPlay
          preload="none"
          playsInline
          loop
        />
      ) : (
        <Image
          src={media.src}
          alt={title}
          width={1200}
          height={800}
          className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-105"
          data-ai-hint={media.hint}
        />
      )}
    </div>
  </div>
);

const ServicesSection = ({ t }: Props) => {
  const items: ServiceItem[] = [
    {
      title: t.businessServiceOilGasTitle,
      bullets: t.businessServiceOilGasBullets,
      media: { src: "/lidar.jpg", hint: "oil gas" },
    },
    {
      title: t.businessServiceContentCreationTitle,
      bullets: t.businessServiceContentCreationBullets,
      media: { src: "/content.mp4", isVideo: true },
    },
  ];

  return (
    <div className="space-y-12">
      {items.map((item, idx) => (
        <div key={idx} className="w-full px-0 md:px-6">
          <ServiceCard {...item} />
        </div>
      ))}
    </div>
  );
};

export default ServicesSection;
