import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Documentation - Sovereign",
  description: "Technical guides and API references for Sovereign products.",
};

export default function DocumentationPage() {
  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-semibold mb-4">Documentation</h1>
      <p className="mb-2">Browse our API docs and integration guides to get started quickly.</p>
      <p>From deployment to custom extensions, everything is covered.</p>
    </div>
  );
}
