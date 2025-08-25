/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  
  // تعطيل type checking أثناء البناء مؤقتاً
  typescript: {
    ignoreBuildErrors: true,
  },
  
  // تعطيل ESLint أثناء البناء مؤقتاً
  eslint: {
    ignoreDuringBuilds: true,
  },
}

module.exports = nextConfig