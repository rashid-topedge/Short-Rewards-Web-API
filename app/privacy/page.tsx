import type { Metadata } from "next";
import Link from "next/link";

// ---- Fill these in before publishing (they appear on the page) ----
const APP_NAME = "DramaFlix";
const DEVELOPER_NAME = "[Your name or company, as shown on Google Play]";
const CONTACT_EMAIL = "[your-support-email@example.com]";
const EFFECTIVE_DATE = "8 November 2026";
// --------------------------------------------------------------------

export const metadata: Metadata = {
  title: `Privacy Policy - ${APP_NAME}`,
  description: `How ${APP_NAME} collects, uses and protects your information.`,
};

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-white/10 pt-6">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-zinc-300">{children}</div>
    </section>
  );
}

const TOC: [string, string][] = [
  ["collect", "Information we collect"],
  ["use", "How we use it"],
  ["share", "Who we share it with"],
  ["ads", "Ads and advertising ID"],
  ["keep", "How long we keep it"],
  ["delete", "Deleting your account"],
  ["security", "Security"],
  ["rights", "Your choices and rights"],
  ["children", "Children"],
  ["changes", "Changes to this policy"],
  ["contact", "Contact us"],
];

export default function PrivacyPage() {
  const mail = <a href={`mailto:${CONTACT_EMAIL}`} className="text-violet-300 underline underline-offset-4 hover:text-violet-200">{CONTACT_EMAIL}</a>;
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-bold text-white sm:text-4xl">Privacy Policy</h1>
      <p className="mt-2 text-sm text-zinc-400">Effective {EFFECTIVE_DATE}</p>
      <p className="mt-6 text-[15px] leading-relaxed text-zinc-300">
        This policy explains what information the {APP_NAME} Android app and website (&ldquo;{APP_NAME}&rdquo;,
        &ldquo;we&rdquo;, &ldquo;us&rdquo;) collect when you watch short dramas and reels, earn coins and request
        payouts, how we use that information, and the choices you have. {APP_NAME} is operated by {DEVELOPER_NAME}.
      </p>

      <nav aria-label="Contents" className="mt-8 rounded-2xl border border-white/10 bg-zinc-900/70 p-5">
        <p className="text-sm font-semibold text-white">Contents</p>
        <ol className="mt-2 grid list-decimal gap-1 pl-5 text-sm text-zinc-300 sm:grid-cols-2">
          {TOC.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="hover:text-white hover:underline">
                {label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-10 space-y-10">
        <Section id="collect" title="1. Information we collect">
          <p><strong className="text-white">Account information.</strong> When you open the app we create an account for you with a random user ID (you can use the app as a guest without giving your name or email). If you choose to sign in with Google, we receive your Google account ID and email address from Google, so you can recover your account on another device.</p>
          <p><strong className="text-white">Rewards and activity.</strong> Your coin balance and coin history; daily check-ins and streak; which reels and episodes you have earned coins for; rewarded ads you completed; reels you liked; and referral details (your referral code and who invited whom). We also count views of reels and dramas, but these are stored as totals, not linked to you.</p>
          <p><strong className="text-white">Payout information.</strong> When you request a payout we collect the payment method you choose (such as Easypaisa, JazzCash, bank transfer or Raast), the account holder&apos;s name, the account or mobile number, the bank name if needed, and the amount. When a payout is sent, we store the payment reference and a screenshot of the payment receipt so you can see it in the app.</p>
          <p><strong className="text-white">Device and technical information.</strong> Our servers receive your IP address and basic request information (such as app version and time) when the app talks to them. We use IP addresses briefly to prevent abuse, such as many accounts being created from one network.</p>
          <p><strong className="text-white">Information collected by Google services in the app.</strong> The app uses Google Firebase (Authentication, Analytics and Crashlytics) and Google AdMob. These may collect device identifiers (such as the advertising ID and a Firebase installation ID), device model, operating system, app usage events, crash reports and approximate location derived from your IP address. See sections 3 and 4.</p>
          <p>We do not collect your contacts, photos, files, precise location, or microphone or camera data.</p>
        </Section>

        <Section id="use" title="2. How we use it">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>To create and run your account, keep your coins safe and let you recover your account with Google.</li>
            <li>To give rewards for check-ins, watching reels and episodes, rewarded ads and referrals, and to show your coin history.</li>
            <li>To process payout requests and send payments to the account you provide, and to show you the payment receipt.</li>
            <li>To prevent fraud and abuse, such as duplicate reward claims, fake accounts or fake referrals.</li>
            <li>To show ads, including rewarded ads you choose to watch.</li>
            <li>To understand how the app is used, fix crashes and improve the app.</li>
            <li>To answer your questions and requests.</li>
          </ul>
          <p>We do not sell your personal information.</p>
        </Section>

        <Section id="share" title="3. Who we share it with">
          <p>We share information only with service providers that help us run {APP_NAME}, and only for that purpose:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li><strong className="text-white">Google Firebase</strong>: sign-in, app analytics and crash reports.</li>
            <li><strong className="text-white">Google AdMob and its mediation partners</strong>: showing ads (see section 4).</li>
            <li><strong className="text-white">Vercel</strong>: hosting our servers and website.</li>
            <li><strong className="text-white">Turso</strong>: our database, where account, coin and payout records are stored.</li>
            <li><strong className="text-white">Backblaze</strong>: storage for videos, images and payout receipts.</li>
            <li><strong className="text-white">Payment services</strong> (such as Easypaisa, JazzCash or your bank): the details needed to send your payout.</li>
          </ul>
          <p>These providers may process data in countries other than yours. We may also disclose information if required by law, to protect our users or {APP_NAME} against fraud, or as part of a sale or merger of the app.</p>
          <p>Our team members who review payouts can see payout details (name, account number and amount) only to send payments.</p>
        </Section>

        <Section id="ads" title="4. Ads and advertising ID">
          <p>The app shows ads through Google AdMob, which may use other ad networks (mediation partners) to fill ads. Google and these partners may collect and use your device&apos;s advertising ID, IP address and information about your device and ad interactions to show ads, measure them and prevent ad fraud. Depending on your settings and where you live, ads may be personalised.</p>
          <p>You can reset your advertising ID or opt out of personalised ads at any time in your phone&apos;s settings (Settings → Google → Ads, or Settings → Privacy → Ads, depending on your device). Learn more in Google&apos;s policy:{" "}
            <a href="https://policies.google.com/technologies/partner-sites" className="text-violet-300 underline underline-offset-4 hover:text-violet-200" target="_blank" rel="noopener noreferrer">How Google uses information from sites or apps that use its services</a>.
          </p>
        </Section>

        <Section id="keep" title="5. How long we keep it">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Account, coin, reward and referral information: for as long as you have an account.</li>
            <li>IP addresses used for abuse prevention: about 2 days in our database. Our hosting provider&apos;s server logs may keep them for a short time.</li>
            <li>Completed payouts: the amount, date and receipt are kept for our financial records, with your name and account number removed once your account is deleted.</li>
            <li>Analytics, crash and ad data held by Google: according to Google&apos;s own retention periods.</li>
          </ul>
          <p>Deleted information may remain in encrypted backups for a short period before it is overwritten.</p>
        </Section>

        <Section id="delete" title="6. Deleting your account">
          <p>You can delete your account and its data at any time:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>In the app: Profile → Delete account.</li>
            <li>On the web: <Link href="/delete-account" className="text-violet-300 underline underline-offset-4 hover:text-violet-200">delete your account</Link> (for accounts linked to Google).</li>
            <li>By emailing us at {mail} from the email linked to your account.</li>
          </ul>
          <p>After you ask, you are signed out on all devices and your account is permanently deleted after 7 days. You can cancel during those 7 days by signing in and choosing to keep your account. If a payout is still being processed, you can delete your account once it is paid or rejected. Coins that have not been paid out are lost when the account is deleted.</p>
        </Section>

        <Section id="security" title="7. Security">
          <p>Data is sent over encrypted connections (HTTPS). Sign-in sessions use short-lived tokens, payout receipts and videos are kept in private storage that can only be reached through temporary links, and only authorised team members can see payout details. No system is perfectly secure, but we work to protect your information.</p>
        </Section>

        <Section id="rights" title="8. Your choices and rights">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>You can use the app as a guest without giving us your name or email.</li>
            <li>You can see your coin history and payout requests in the app.</li>
            <li>You can ask us for a copy of your information, ask us to correct it, or ask us to delete it, by writing to {mail}.</li>
            <li>You can control ad personalisation and reset your advertising ID in your phone&apos;s settings.</li>
          </ul>
        </Section>

        <Section id="children" title="9. Children">
          <p>{APP_NAME} is not directed to children under 13, and we do not knowingly collect personal information from children under 13. If you believe a child has given us personal information, contact us and we will delete it.</p>
        </Section>

        <Section id="changes" title="10. Changes to this policy">
          <p>We may update this policy from time to time. When we do, we will change the effective date above, and for important changes we will let you know in the app.</p>
        </Section>

        <Section id="contact" title="11. Contact us">
          <p>Questions or requests about your privacy: {mail}</p>
          <p>{DEVELOPER_NAME}</p>
        </Section>
      </div>
    </article>
  );
}
