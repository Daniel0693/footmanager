FROM node:20-alpine AS base
WORKDIR /app
# libc6-compat + toolchain natif : bcrypt (et autres addons natifs) doivent
# pouvoir compiler depuis les sources si aucun binaire prébuilt musl n'existe.
RUN apk add --no-cache libc6-compat
# `prisma generate` lit DATABASE_URL via prisma.config.ts au build (pas de
# connexion réelle nécessaire) ; la vraie valeur est injectée au runtime par
# docker-compose.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"

FROM base AS deps
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm install

FROM deps AS dev
COPY . .
RUN npx prisma generate
EXPOSE 3001
CMD ["npm", "run", "start:dev"]

FROM deps AS build
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS prod
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
RUN npx prisma generate
EXPOSE 3001
CMD ["node", "dist/main"]
