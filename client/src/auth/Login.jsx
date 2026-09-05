// Login.jsx — sign-in / create-account / Google / Guest, shown when signed out.
import React, { useState } from "react";
import { useAuth } from "./AuthProvider.jsx";
import matriculaIcon from "../assets/matricula-icon.png";

export function Login() {
  const { signInEmail, signUpEmail, signInGoogle, signInGuest, configured } = useAuth();
  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const friendly = (code) => {
    if (/invalid-credential|wrong-password|user-not-found/.test(code)) return "Email or password is incorrect.";
    if (/email-already-in-use/.test(code)) return "An account with this email already exists — try signing in.";
    if (/weak-password/.test(code)) return "Password should be at least 6 characters.";
    if (/invalid-email/.test(code)) return "That doesn't look like a valid email.";
    if (/popup-closed-by-user/.test(code)) return "Google sign-in was cancelled.";
    if (/operation-not-allowed|admin-restricted-operation/.test(code)) return "Guest sign-in isn't turned on for this app yet — enable \"Anonymous\" in Firebase Authentication settings.";
    return "Something went wrong. Please try again.";
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      if (mode === "signup") await signUpEmail(email.trim(), password);
      else await signInEmail(email.trim(), password);
    } catch (e2) { setErr(friendly(String(e2.code || e2.message || ""))); }
    finally { setBusy(false); }
  };

  const google = async () => {
    setErr(null); setBusy(true);
    try { await signInGoogle(); }
    catch (e2) { setErr(friendly(String(e2.code || e2.message || ""))); }
    finally { setBusy(false); }
  };

  const guest = async () => {
    setErr(null); setBusy(true);
    try { await signInGuest(); }
    catch (e2) { setErr(friendly(String(e2.code || e2.message || ""))); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
      <div className="card pad stack" style={{ maxWidth: 400, width: "100%", gap: 14 }}>
        <div style={{ textAlign: "center" }}>
          <img src={matriculaIcon} alt="" height="56" style={{ display: "block", margin: "0 auto 4px", width: "auto" }} />
          <div className="eyebrow">Welcome to</div>
          <h1 style={{ margin: "2px 0" }}>Matricula</h1>
          <p className="note">Sign in to continue</p>
        </div>

        {!configured && (
          <div className="note" style={{ color: "var(--reach)", fontSize: 12, borderLeft: "3px solid var(--reach)", paddingLeft: 8 }}>
            Authentication isn't configured yet. Set the <code>VITE_FIREBASE_*</code> variables (see
            <code> client/.env.example</code>) and rebuild.
          </div>
        )}

        <form onSubmit={submit} className="stack" style={{ gap: 10 }}>
          <div>
            <div className="k" style={{ fontSize: 12 }}>Email</div>
            <input className="inp" type="email" autoComplete="email" required value={email}
              onChange={(e) => setEmail(e.target.value)} disabled={!configured || busy} placeholder="you@example.com" />
          </div>
          <div>
            <div className="k" style={{ fontSize: 12 }}>Password</div>
            <input className="inp" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required value={password} onChange={(e) => setPassword(e.target.value)}
              disabled={!configured || busy} placeholder="••••••••" />
          </div>

          {err && <div className="note" style={{ color: "var(--reach)", fontSize: 12 }}>{err}</div>}

          <button className="btn primary" type="submit" disabled={!configured || busy}>
            {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>

        <div className="row" style={{ justifyContent: "center", gap: 6 }}>
          <span className="note" style={{ fontSize: 12 }}>
            {mode === "signup" ? "Already have an account?" : "New here?"}
          </span>
          <button className="btn sm ghost" type="button" onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setErr(null); }}>
            {mode === "signup" ? "Sign in" : "Create account"}
          </button>
        </div>

        <div className="row" style={{ alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
          <span className="note" style={{ fontSize: 11 }}>or</span>
          <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
        </div>

        <button className="btn ghost" type="button" onClick={google} disabled={!configured || busy}>
          Continue with Google
        </button>

        <button className="btn ghost" type="button" onClick={guest} disabled={!configured || busy}>
          Continue as Guest
        </button>
        <p className="note" style={{ fontSize: 11, textAlign: "center", marginTop: -6 }}>
          For trying the app out. Your data is saved to a guest account and isn't linked to an email — use Sign in or Google if you want to keep access to it later.
        </p>
      </div>
    </div>
  );
}
