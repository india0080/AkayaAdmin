import { initializeApp, getApps } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";

// ── Environment ─────────────────────────────────────────────────────────────
// NEXT_PUBLIC_USE_EMULATORS=1 points the console at the LOCAL Firebase
// emulators (Auth 9099, Firestore 8080, Functions 5001) under the
// emulator-only project id `demo-akaya`. That is the only safe way to
// exercise the console: `akaya-ai` is the one real project and it is
// PRODUCTION. `npm run dev:local` sets this for you.
export const USE_EMULATORS = process.env.NEXT_PUBLIC_USE_EMULATORS === "1";
// Emulator ports (only used when USE_EMULATORS); override to run beside another emulator suite.
const EMU_PORTS = {
  auth: Number(process.env.NEXT_PUBLIC_EMU_AUTH_PORT ?? 9099),
  firestore: Number(process.env.NEXT_PUBLIC_EMU_FIRESTORE_PORT ?? 8080),
  functions: Number(process.env.NEXT_PUBLIC_EMU_FUNCTIONS_PORT ?? 5001),
};

const firebaseConfig = USE_EMULATORS
  ? {
      apiKey: "emulator-only",
      authDomain: "demo-akaya.firebaseapp.com",
      projectId: process.env.NEXT_PUBLIC_EMU_PROJECT_ID ?? "demo-akaya",
      storageBucket: "demo-akaya.appspot.com",
      messagingSenderId: "0",
      appId: "1:0:web:emulator",
    }
  : {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    };

export const PROJECT_ID = firebaseConfig.projectId ?? "unknown";

/// What the environment badge shows. Anything that is not provably the
/// emulator is treated as live data.
export type ConsoleEnvironment = "emulator" | "production" | "other";
export const ENVIRONMENT: ConsoleEnvironment = USE_EMULATORS
  ? "emulator"
  : PROJECT_ID === "akaya-ai"
    ? "production"
    : "other";

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);
export const fns = getFunctions(app); // us-central1 — matches deployed function region

if (USE_EMULATORS && typeof window !== "undefined") {
  const w = window as unknown as { __akayaEmulatorsConnected?: boolean };
  // Guard against double-connect on fast refresh (the SDKs throw).
  if (!w.__akayaEmulatorsConnected) {
    w.__akayaEmulatorsConnected = true;
    connectAuthEmulator(auth, `http://127.0.0.1:${EMU_PORTS.auth}`, { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", EMU_PORTS.firestore);
    connectFunctionsEmulator(fns, "localhost", EMU_PORTS.functions);
  }
}
