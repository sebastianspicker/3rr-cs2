# Stage 1: Build - compile TypeScript and bundle client
FROM node:26.9.0-bookworm-slim@sha256:582460f614631b59b824ac6020533b9bf339c7fdf3a6d7db31abb6b4065f0212 AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
  python3=3.11.2-1+b1 \
  make=4.3-4.1 \
  g++=4:12.2.0-3 \
  git=1:2.39.5-0+deb12u2 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /build

COPY package.json package-lock.json .npmrc ./
RUN npm ci && rm -rf /root/.npm /tmp/*

COPY . .

RUN npm run build && \
  find dist -name '*.map' -delete && \
  npm prune --omit=dev && \
  rm -rf /root/.npm /tmp/*

# Stage 2: Runtime - minimal image with only production artifacts
FROM node:26.9.0-bookworm-slim@sha256:582460f614631b59b824ac6020533b9bf339c7fdf3a6d7db31abb6b4065f0212

ENV NODE_ENV=production

WORKDIR /home/container

# Copy only what's needed at runtime (no source TS, build tools, or dev deps)
COPY --from=builder /build/dist ./dist
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/web/generated ./web/generated
COPY --from=builder /build/web/views ./web/views
COPY --from=builder /build/package.json ./
COPY --from=builder /build/LICENSE ./LICENSE

RUN mkdir -p /home/container/data && chown -R node:node /home/container

EXPOSE 3000

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>{process.exit(r.ok?0:1)}).catch(()=>process.exit(1))"

CMD ["node", "dist/src/main.js"]
