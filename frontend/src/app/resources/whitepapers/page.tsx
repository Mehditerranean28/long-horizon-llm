import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Whitepapers - Sovereign",
  description: "In-depth research and strategic insights from our experts.",
};

export default function WhitepapersPage() {
  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-semibold mb-4">Whitepapers</h1>
      <p className="mb-2">Download our whitepapers to learn about adopting AI in complex environments.</p>
      <p>We share methodologies and case studies from real-world deployments.</p>
    </div>
  );
}
