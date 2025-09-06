import type { AppTranslations } from "@/lib/translations";

export type Story = {
  slug: string;
  title: string;
  service: string;
  paragraphs: string[];
};

export const stories = (t: AppTranslations): Story[] => [
  {
    slug: "growing-resys-marketshare-with-end-to-end-hiring-services",
    title: t.customerStoryResyTitle,
    service: t.customerStoryResyService,
    paragraphs: [
      t.customerStoryResyParagraph1,
      t.customerStoryResyParagraph2,
      t.customerStoryResyParagraph3,
    ],
  },
  {
    slug: "scaling-predictive-analytics-expanding-machine-learning-framework-for-revenue-growth",
    title: t.customerStoryIndeedTitle,
    service: t.customerStoryIndeedService,
    paragraphs: [
      t.customerStoryIndeedParagraph1,
      t.customerStoryIndeedParagraph2,
      t.customerStoryIndeedParagraph3,
    ],
  },
  {
    slug: "how-kinship-launched-a-new-web-application-with-a-rapid-action-team-in-90-days",
    title: t.customerStoryKinshipTitle,
    service: t.customerStoryKinshipService,
    paragraphs: [
      t.customerStoryKinshipParagraph1,
      t.customerStoryKinshipParagraph2,
      t.customerStoryKinshipParagraph3,
    ],
  },
  {
    slug: "elevating-scvs-cloud-security-score-to-95-30-days-ahead-of-schedule",
    title: t.customerStoryScvTitle,
    service: t.customerStoryScvService,
    paragraphs: [
      t.customerStoryScvParagraph1,
      t.customerStoryScvParagraph2,
      t.customerStoryScvParagraph3,
    ],
  },
  {
    slug: "liquid-data-platform",
    title: t.customerStoryCircanaTitle,
    service: t.customerStoryCircanaService,
    paragraphs: [
      t.customerStoryCircanaParagraph1,
      t.customerStoryCircanaParagraph2,
      t.customerStoryCircanaParagraph3,
    ],
  },
  {
    slug: "levating-gopuffs-database-uptime-by-80-with-a-seamless-azure-integration",
    title: t.customerStoryGopuffTitle,
    service: t.customerStoryGopuffService,
    paragraphs: [
      t.customerStoryGopuffParagraph1,
      t.customerStoryGopuffParagraph2,
      t.customerStoryGopuffParagraph3,
    ],
  },
  {
    slug: "maintaining-compliance-for-kindhealth-with-new-authorization-systems-and-data-reporting",
    title: t.customerStoryKindHealthTitle,
    service: t.customerStoryKindHealthService,
    paragraphs: [
      t.customerStoryKindHealthParagraph1,
      t.customerStoryKindHealthParagraph2,
      t.customerStoryKindHealthParagraph3,
    ],
  },
  {
    slug: "how-sovereign-talent-paved-the-way-for-change-machines-online-platform-success",
    title: t.customerStoryLawFirmTitle,
    service: t.customerStoryLawFirmService,
    paragraphs: [
      t.customerStoryLawFirmParagraph1,
      t.customerStoryLawFirmParagraph2,
      t.customerStoryLawFirmParagraph3,
    ],
  },
  {
    slug: "revamping-headspace-healths-cms-to-serve-a-rapidly-scaling-customer-base",
    title: t.customerStoryHeadspaceTitle,
    service: t.customerStoryHeadspaceService,
    paragraphs: [
      t.customerStoryHeadspaceParagraph1,
      t.customerStoryHeadspaceParagraph2,
      t.customerStoryHeadspaceParagraph3,
    ],
  },
  {
    slug: "boosting-supply-chain-analytics-for-major-retailer",
    title: t.customerStoryRetailTitle,
    service: t.customerStoryRetailService,
    paragraphs: [
      t.customerStoryRetailParagraph1,
      t.customerStoryRetailParagraph2,
      t.customerStoryRetailParagraph3,
    ],
  },
  {
    slug: "accelerating-marketing-content-with-generative-ai",
    title: t.customerStoryMarketingTitle,
    service: t.customerStoryMarketingService,
    paragraphs: [
      t.customerStoryMarketingParagraph1,
      t.customerStoryMarketingParagraph2,
      t.customerStoryMarketingParagraph3,
    ],
  },
  {
    slug: "digital-twin-implementation-drives-efficiency",
    title: t.customerStoryDigitalTwinTitle,
    service: t.customerStoryDigitalTwinService,
    paragraphs: [
      t.customerStoryDigitalTwinParagraph1,
      t.customerStoryDigitalTwinParagraph2,
      t.customerStoryDigitalTwinParagraph3,
    ],
  },
];

