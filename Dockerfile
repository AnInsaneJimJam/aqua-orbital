FROM node:22.18.0-bookworm-slim
RUN npm install --global pnpm@10.34.5
WORKDIR /workspace
COPY . .
RUN pnpm install --frozen-lockfile
# Development image. Financial deployment remains gated separately.
ENV HOST=0.0.0.0
CMD ["pnpm", "--filter", "@orbital/api", "dev"]
