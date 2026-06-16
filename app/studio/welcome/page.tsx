import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth/session";
import { queryUserById } from "@/lib/content/db";
import { handleSlugify } from "@/lib/content/handle";
import WelcomeForm from "./WelcomeForm";

export const dynamic = "force-dynamic";

// First-time onboarding: pick a unique handle (locked after selection).
// Reachable only when the user is signed in but has no handle yet.
export default async function WelcomePage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/studio/login");

  const user = queryUserById(userId);
  if (!user) redirect("/studio/login");
  if (user.handle) redirect("/studio");

  const suggested = handleSlugify(user.email);

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="font-serif text-3xl">歡迎</h1>
          <p className="text-stone-500 text-sm mt-1">選一個代稱，這會變成你的公開 URL</p>
        </div>
        <WelcomeForm email={user.email} suggested={suggested} />
      </div>
    </div>
  );
}
