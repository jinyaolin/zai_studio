"use client";

import { useState } from "react";

export default function LoginForm({ next, googleError }: { next?: string; googleError?: string }) {
  const [busy, setBusy] = useState(false);

  function handleGoogle() {
    setBusy(true);
    // Stash `next` in a cookie or just default to /studio after login.
    // For simplicity we ignore next here — OAuth callback always sends
    // welcome-less users to /studio, handle-less to /studio/welcome.
    window.location.href = "/api/auth/google/start";
  }

  return (
    <div className="space-y-4">
      {googleError && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          Google 登入失敗：{googleError}
        </p>
      )}
      <button
        type="button"
        onClick={handleGoogle}
        disabled={busy}
        className="w-full px-4 py-3 bg-white border border-stone-300 rounded-md hover:bg-stone-50 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
          <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.583-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
          <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
          <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
        </svg>
        {busy ? "登入中…" : "用 Google 帳號登入"}
      </button>
      <p className="text-xs text-stone-500 text-center">
        首次登入會建立帳號並引導你選擇使用者代稱。
      </p>
    </div>
  );
}
