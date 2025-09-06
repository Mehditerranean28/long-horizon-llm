import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About Us - Sovereign",
  description: "Learn more about Sovereign Consulting and our mission.",
};

export default function AboutPage() {
  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-semibold mb-4">About Us</h1>
      <p className="mb-2">Sovereign Consulting delivers AI-driven software and infrastructure solutions for modern businesses.</p>
      <p>We combine deep engineering expertise with strategic insight to help you scale securely and efficiently.</p>
    </div>
  );
}
