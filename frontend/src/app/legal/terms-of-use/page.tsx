import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Use - Sovereign",
  description: "The rules for using our services and website.",
};

export default function TermsOfUsePage() {
  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-semibold mb-4">Terms of Use</h1>
      <p className="mb-2">Please review these terms before using our products or services.</p>
      <p>By accessing our site, you agree to comply with them.</p>
    </div>
  );
}
