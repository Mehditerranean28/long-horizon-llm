import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reasoning System - Sovereign",
  description: "Learn about our deterministic reasoning system for complex tasks.",
};

export default function ReasoningSystemPage() {
  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-semibold mb-4">Reasoning System</h1>
      <p className="mb-2">Our deterministic reasoning system plans and executes long-horizon projects with auditability.</p>
      <p>It integrates with your existing data sources to deliver reliable outcomes.</p>
    </div>
  );
}
