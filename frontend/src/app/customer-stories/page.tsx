import Link from "next/link";
import type { Metadata } from "next";
import { stories } from "./stories";

export const metadata: Metadata = {
  title: "Customer Stories - Sovereign",
  description: "Real-world success stories showcasing our Signature Services.",
};

export default function CustomerStoriesPage() {
  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-semibold mb-4">Customer Stories</h1>
      <ul className="list-disc pl-5 space-y-2">
        {stories.map((s) => (
          <li key={s.slug}>
            <Link href={`/customer-stories/${s.slug}`} className="text-blue-600 underline">
              {s.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
