import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <h1 className="text-3xl font-semibold mb-6">Privacy Policy</h1>
      <p className="text-muted-foreground mb-4">Last updated: March 2026</p>
      <div className="prose prose-slate max-w-none space-y-4">
        <h2 className="text-xl font-semibold mt-8">1. Information We Collect</h2>
        <p>
          We collect information you provide directly when using the Aptus SAP Best Practices
          Process Validation Portal, including your name, email address, organization details,
          and assessment data entered during the evaluation process.
        </p>

        <h2 className="text-xl font-semibold mt-8">2. How We Use Your Information</h2>
        <p>We use your information to:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Provide and maintain the Service</li>
          <li>Authenticate your identity and manage your account</li>
          <li>Generate assessment reports and analytics</li>
          <li>Send notifications relevant to your assessments</li>
          <li>Improve and develop the Service</li>
        </ul>

        <h2 className="text-xl font-semibold mt-8">3. Data Storage and Security</h2>
        <p>
          Your data is stored securely using industry-standard encryption. We implement
          appropriate technical and organizational measures to protect your personal data
          against unauthorized access, alteration, disclosure, or destruction.
        </p>

        <h2 className="text-xl font-semibold mt-8">4. Data Sharing</h2>
        <p>
          We do not sell your personal data. Data may be shared within your organization
          as configured by your administrator, and with service providers who assist in
          operating the platform.
        </p>

        <h2 className="text-xl font-semibold mt-8">5. Your Rights</h2>
        <p>
          You have the right to access, correct, or delete your personal data. Contact
          your organization administrator or Aptus support to exercise these rights.
        </p>

        <h2 className="text-xl font-semibold mt-8">6. Cookies and Session Data</h2>
        <p>
          We use session cookies to authenticate your access and maintain your login state.
          These are essential for the Service to function and cannot be disabled.
        </p>

        <h2 className="text-xl font-semibold mt-8">7. Contact</h2>
        <p>
          For privacy-related inquiries, please contact your Aptus project team or
          administrator.
        </p>
      </div>
    </div>
  );
}
