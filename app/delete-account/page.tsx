import type { Metadata } from "next";
import DeleteAccountClient from "./DeleteAccountClient";

export const metadata: Metadata = {
  title: "Delete your account - Rayz Clip",
  description: "Request deletion of your Rayz Clip account and its data.",
};

export const dynamic = "force-dynamic";

export default function DeleteAccountPage() {
  // The Web client ID is public (it's in every Google sign-in button); the server
  // accepts tokens for the IDs in GOOGLE_OAUTH_CLIENT_IDS, so use the first one.
  const clientId = (process.env.GOOGLE_OAUTH_CLIENT_IDS || "").split(",")[0]?.trim() || null;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-bold text-white sm:text-3xl">Delete your account</h1>
      <p className="mt-3 text-zinc-300">
        You can ask us to delete your Rayz Clip account and the data linked to it. The account is signed out
        right away and deleted for good after 7 days. Until then you can change your mind.
      </p>

      <section className="mt-8 rounded-2xl border border-white/10 bg-zinc-900/70 p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-white">In the app</h2>
        <p className="mt-2 text-sm text-zinc-300">
          Open the app → <strong>Profile</strong> → <strong>Delete account</strong>. This works for every account,
          including guest accounts.
        </p>
      </section>

      <section className="mt-4 rounded-2xl border border-white/10 bg-zinc-900/70 p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-white">On this page</h2>
        <p className="mt-2 text-sm text-zinc-300">
          Sign in with the Google account you linked in the app. Guest accounts that never linked Google can only be
          deleted from the app.
        </p>
        <DeleteAccountClient clientId={clientId} />
      </section>

      <section className="mt-4 rounded-2xl border border-white/10 bg-zinc-900/70 p-5 text-sm text-zinc-300 sm:p-6">
        <h2 className="text-lg font-semibold text-white">What is deleted</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Your account, coin balance and coin history</li>
          <li>Your check-in streak, rewards, likes and referral details</li>
          <li>Your linked Google email and sign-ins on all devices</li>
          <li>Payout requests that weren&apos;t paid</li>
        </ul>
        <h2 className="mt-4 text-lg font-semibold text-white">What is kept</h2>
        <p className="mt-2">
          For completed payouts we keep the amount, date and payment receipt for our accounting records. Your name and
          account number are removed from them. Unused coins can&apos;t be paid out after deletion.
        </p>
        <p className="mt-2">If you have a payout still being processed, you can delete your account once it&apos;s paid or rejected.</p>
        <p className="mt-2">
          More details are in our{" "}
          <a href="/privacy" className="text-violet-300 underline underline-offset-4 hover:text-violet-200">
            Privacy Policy
          </a>
          .
        </p>
      </section>

      <section className="mt-4 rounded-2xl border border-white/10 bg-zinc-900/70 p-5 text-sm text-zinc-300 sm:p-6">
        <h2 className="text-lg font-semibold text-white">Need help?</h2>
        <p className="mt-2">
          Can&apos;t sign in, or using the app as a guest? Email us and we&apos;ll help:{" "}
          <a href="mailto:yusraraaheel@gmail.com" className="text-violet-300 underline underline-offset-4 hover:text-violet-200">
            yusraraaheel@gmail.com
          </a>{" "}
          or{" "}
          <a href="mailto:rashid7bilal@gmail.com" className="text-violet-300 underline underline-offset-4 hover:text-violet-200">
            rashid7bilal@gmail.com
          </a>
          .
        </p>
        <p className="mt-2 text-zinc-500">Rayz Clip is published on Google Play by Online Math Learning.</p>
      </section>
    </div>
  );
}
