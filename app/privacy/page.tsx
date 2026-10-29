import { LegalPage } from "@/components/legal/legal-page";
import { ORGANIZATION, UPDATED, contactEmail } from "@/lib/legal";

export const metadata = { title: "Privacy policy" };
export const dynamic = "force-dynamic";

/** Public privacy policy: what Kinus keeps about people, and that phone numbers are never shared. */
export default async function PrivacyPage() {
  const email = await contactEmail();
  return (
    <LegalPage title="Privacy policy" updated={UPDATED}>
      <p>
        {ORGANIZATION} (“we”, “camp”) runs Kinus, the system camp staff use to check campers in and out, print name tags and keep in touch with staff. This policy explains what we keep and
        how we use it.
      </p>
      <h2>What we collect</h2>
      <ul>
        <li>For campers: the details families give at registration (names, bunk and division, contacts, medical and other notes) and check-in and check-out times.</li>
        <li>For staff: name, email, mobile phone number, role, and where they work at camp, from the staff application or added by camp directors.</li>
        <li>For people who sign up for text updates: name, mobile phone number, and the date and wording of their consent.</li>
      </ul>
      <h2>How we use it</h2>
      <ul>
        <li>To run camp: checking campers in and out, keeping them safe, printing tags and lists.</li>
        <li>To text staff and people who signed up: schedules, reminders, changes and urgent notices about camp.</li>
      </ul>
      <h2>Text messages and your phone number</h2>
      <p>
        We use your mobile number only to send you messages about camp. <strong>No mobile information will be shared with third parties or affiliates for marketing or promotional purposes.</strong>{" "}
        Text messaging opt-in data and consent are never shared with any third party. Our text messaging provider (Twilio) delivers the messages for us and handles the numbers only to do
        that.
      </p>
      <p>You can stop texts at any time by replying STOP. Reply HELP for help.</p>
      <h2>Who can see it</h2>
      <p>
        Only camp staff who need it, by their role (for example, a counselor sees their own bunk). We don’t sell or rent personal information. Our service providers (hosting, database,
        email and text delivery) process it on our behalf only.
      </p>
      <h2>How long we keep it</h2>
      <p>For as long as it’s needed for camp and our records, then it’s deleted. You can ask us to correct or delete your information.</p>
      <h2>Contact</h2>
      <p>Questions or requests: {email ? <a href={`mailto:${email}`} className="text-primary hover:underline">{email}</a> : "the camp office"}.</p>
    </LegalPage>
  );
}
