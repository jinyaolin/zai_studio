"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }
  return (
    <button
      type="button"
      onClick={logout}
      className="text-sm text-stone-600 underline hover:text-stone-900"
    >
      登出
    </button>
  );
}
