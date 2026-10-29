/** Who sends Kinus' texts: the brand registered with Twilio, and the camp program it runs. */
export const ORGANIZATION = "Shluchim Office International";
export const CAMP = "Kinus Tzeirei Hashluchim";
/** How texts and the sign-up page name the sender: the registered brand first, so carriers can match it. */
export const SENDER = `${ORGANIZATION} (${CAMP})`;
export const PROGRAM = "Kinus staff text updates";

/** What the texts are, and how often: shown on the sign-up page and in the terms. */
export const UPDATES_ABOUT = "Camp staff updates: schedules, reminders, changes and urgent notices about camp.";
export const UPDATES_FREQUENCY = "Message frequency varies (usually a few messages a week during camp).";

/** The words people agree to on the sign-up page, kept with each sign-up exactly as shown. */
export const UPDATES_CONSENT = `Yes, I agree to receive text messages from ${SENDER} at this number with camp staff updates (schedules, reminders, changes and urgent notices). Message frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to opt out.`;

/** The text sent right after someone signs up (carriers expect one). */
export const UPDATES_WELCOME = `${ORGANIZATION}: You're signed up for ${CAMP} camp staff updates. Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to opt out.`;
