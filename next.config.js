/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Isolate local verification builds from concurrent development servers.
  distDir: process.env.AKAYA_NEXT_DIST_DIR || ".next",
  output: "export",
  basePath: "/Admin",
  trailingSlash: false,
  images: { unoptimized: true },
};

module.exports = nextConfig;
