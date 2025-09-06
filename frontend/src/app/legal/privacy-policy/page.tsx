import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy - Sovereign",
  description: "Our commitment to protecting your personal information.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-semibold mb-4">Privacy Policy</h1>
      <p className="mb-2">We value your privacy and outline how we handle data in this policy.</p>
      <p>For any questions, please contact our legal team.</p>
    </div>
  );
}
