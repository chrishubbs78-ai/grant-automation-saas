/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@syncstage/shared"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
