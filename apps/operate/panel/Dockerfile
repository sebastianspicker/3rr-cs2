# Stage 1: Build — compile TypeScript and bundle client
FROM node:22-bookworm-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 \
  make \
  g++ \
  git \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /build

COPY package.json package-lock.json .npmrc ./
RUN npm ci && rm -rf /root/.npm /tmp/*

COPY . .

RUN node scripts/copy-fonts.js && \
  npx tsc && \
  find dist -name '*.map' -delete && \
  npx esbuild public/ts/console.ts --bundle --outfile=public/js/console.js --target=es2020 && \
  npm prune --omit=dev && \
  rm -rf /root/.npm /tmp/*

# Stage 2: Runtime — minimal image with only production artifacts
FROM node:22-bookworm-slim

ENV NODE_ENV=production

WORKDIR /home/container

# Copy only what's needed at runtime (no source TS, build tools, or dev deps)
COPY --from=builder /build/dist ./dist
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/public/js ./public/js
COPY --from=builder /build/public/css ./public/css
COPY --from=builder /build/public/fonts ./public/fonts
COPY --from=builder /build/views ./views
COPY --from=builder /build/cfg ./cfg
COPY --from=builder /build/package.json ./

RUN mkdir -p /home/container/data && chown -R node:node /home/container

EXPOSE 3000

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>{process.exit(r.ok?0:1)}).catch(()=>process.exit(1))"

CMD ["node", "dist/app.js"]
