import { redirect } from "next/navigation";

/** There is no public website any more: the root address shows the privacy policy. */
export default function Home() {
  redirect("/privacy");
}
