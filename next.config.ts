import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // 部署打包时生成自带依赖的独立产物，并输出到单独目录，不与正在运行的 dev 服务抢 .next
  output: process.env.BUILD_STANDALONE ? 'standalone' : undefined,
  distDir: process.env.BUILD_STANDALONE ? '.next-release' : '.next',
  devIndicators: false,
}

export default nextConfig
