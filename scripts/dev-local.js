// Runs the console against the LOCAL Firebase emulators, never production.
//
//   1. In akaya_ai/functions:  npm run emulators      (Auth, Firestore, Functions + seed)
//   2. Here:                   npm run dev:local      (http://localhost:3000/Admin)
//
// Environment set here overrides .env.local (Next never overwrites an
// existing process.env value), so the real project config in .env.local is
// ignored for this process.

const { spawn } = require("child_process");
const path = require("path");

const env = {
  ...process.env,
  NEXT_PUBLIC_USE_EMULATORS: "1",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-akaya",
  NEXT_TELEMETRY_DISABLED: "1",
};

const nextBin = require.resolve("next/dist/bin/next");
const port = process.env.PORT || "3000";
const child = spawn(process.execPath, [nextBin, "dev", "-p", port], {
  cwd: path.join(__dirname, ".."),
  env,
  stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
