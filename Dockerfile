FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
RUN npm run clean && npx vite build

FROM node:22-bookworm-slim AS production
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY src/server ./src/server
COPY src/shared ./src/shared
USER 10001
EXPOSE 8080
CMD ["npm", "start"]
