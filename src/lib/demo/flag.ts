// Dev-only demo mode. Renders the console with clearly labelled SAMPLE data
// so designs can be reviewed without a backend. It can never turn on in a
// production build: NODE_ENV is inlined as "production" by `next build`,
// and it additionally requires the emulator config.
export const DEMO_MODE =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_USE_EMULATORS === "1" &&
  process.env.NEXT_PUBLIC_ADMIN_DEMO === "1";
