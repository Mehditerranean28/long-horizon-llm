import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { stories } from "../stories";

type Props = { params: { slug: string } };

export function generateMetadata({ params }: Props): Metadata {
  const story = stories.find((s) => s.slug === params.slug);
  if (!story) return { title: "Story Not Found" };
  return {
    title: `${story.title} - Sovereign`,
    description: `How Sovereign delivered value through ${story.service}.`,
  };
}

export default function StoryPage({ params }: Props) {
  const story = stories.find((s) => s.slug === params.slug);
  if (!story) return notFound();
  return (
    <div className="container mx-auto p-8 space-y-4">
      <h1 className="text-3xl font-semibold">{story.title}</h1>
      <p className="italic text-sm">Signature Service: {story.service}</p>
      {story.paragraphs.map((p, idx) => (
        <p key={idx}>{p}</p>
      ))}
    </div>
  );
}
