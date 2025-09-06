import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blog - Sovereign",
  description: "Insights and news from the Sovereign Consulting team.",
};

export default function BlogPage() {
  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-semibold mb-4">Blog</h1>
      <p className="mb-2">Articles on AI, infrastructure, and software best practices.</p>
      <p>Check back regularly for updates and industry tips.</p>
    </div>
  );
}
