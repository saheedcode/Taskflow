import { redirect } from "next/navigation";
import { cookies } from "next/headers";

export default function Home() {
  const hasSession = cookies().get("tf_has_session");
  // Signed-in visitors go straight to their workspace; everyone else
  // lands on signup first (rather than login), since that's the more
  // useful default for someone arriving at the app for the first time.
  redirect(hasSession ? "/workspace" : "/signup");
}
