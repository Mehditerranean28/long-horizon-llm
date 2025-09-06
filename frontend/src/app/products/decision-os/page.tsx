import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Decision OS - Sovereign",
  description: "Discover our Decision OS for orchestrating enterprise operations.",
};

export default function DecisionOSPage() {
  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-semibold mb-4">Decision OS</h1>
      <p className="mb-2">Decision OS helps you coordinate AI agents and human workflows to make informed decisions.</p>
      <p>Use it to automate approvals, monitor metrics, and adapt strategies quickly.</p>
    </div>
  );
}
