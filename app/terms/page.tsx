import { LegalPage } from "@/components/legal/legal-page";
import { ORGANIZATION, PROGRAM, UPDATED, contactEmail } from "@/lib/legal";

export const metadata = { title: "Text message terms" };
export const dynamic = "force-dynamic";

/** Public terms for the text messages camp sends (what carriers and Twilio ask a sender to publish). */
export default async function TermsPage() {
  const email = await contactEmail();
  return (
    <LegalPage title="Text message terms" updated={UPDATED}>
      <h2>{PROGRAM}</h2>
      <p>
        {ORGANIZATION} sends text messages to its camp staff and to people who sign up at our updates page: schedules, reminders, changes and urgent notices about camp. Staff receive
        them because they gave their mobile number to camp on their staff application; others receive them because they signed up and agreed to receive them.
      </p>
      <ul>
        <li>Message frequency varies, usually a few messages a week during camp.</li>
        <li>Message and data rates may apply.</li>
        <li>
          Reply <strong>STOP</strong> to stop receiving messages at any time. You’ll get one message confirming you’re unsubscribed. Reply <strong>START</strong> to receive them again.
        </li>
        <li>
          Reply <strong>HELP</strong> for help, or contact us at {email ? <a href={`mailto:${email}`} className="text-primary hover:underline">{email}</a> : "the camp office"}.
        </li>
        <li>Carriers are not liable for delayed or undelivered messages.</li>
        <li>Signing up is not a condition of employment or of attending camp.</li>
      </ul>
      <h2>Privacy</h2>
      <p>
        Your number is used only for messages from camp and is never shared or sold for marketing. See our <a href="/privacy" className="text-primary hover:underline">privacy policy</a>.
      </p>
    </LegalPage>
  );
}
