const nextConfig = {
  output: 'standalone',
  images: {
    unoptimized: true,
  },
  experimental: {
    serverComponentsExternalPackages: [
      'mongodb',
      '@resvg/resvg-js',
      'satori',
      'sharp',
      'uuid',
      'dotenv',
      'axios',
      'cheerio',
      'groq-sdk',
      '@huggingface/transformers',
    ],
  },
  webpack(config, { dev, isServer }) {
    if (dev) {
      config.watchOptions = {
        poll: 2000,
        aggregateTimeout: 300,
        ignored: ['**/node_modules'],
      };
    }

    // Keep @huggingface/transformers and its sub-paths entirely out of the
    // webpack bundle — it is a large native Node package that must be loaded
    // by Node's require() at runtime, not bundled by webpack.
    // We wrap any existing externals array/function so we don't break Next's
    // own server-side externals logic.
    if (isServer) {
      const prev = config.externals;
      config.externals = [
        // Our rule: anything under @huggingface/transformers is external.
        ({ request }, callback) => {
          if (request && (
            request === '@huggingface/transformers' ||
            request.startsWith('@huggingface/transformers/')
          )) {
            return callback(null, `commonjs ${request}`);
          }
          callback();
        },
        // Preserve whatever Next.js already put in externals.
        ...(Array.isArray(prev) ? prev : prev ? [prev] : []),
      ];
    }

    return config;
  },
  onDemandEntries: {
    maxInactiveAge: 10000,
    pagesBufferLength: 2,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "ALLOWALL" },
          { key: "Content-Security-Policy", value: "frame-ancestors *;" },
          { key: "Access-Control-Allow-Origin", value: process.env.CORS_ORIGINS || "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, PUT, DELETE, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "*" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
