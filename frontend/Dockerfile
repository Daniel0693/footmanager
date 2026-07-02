FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

FROM base AS deps
COPY package*.json ./
RUN npm install

FROM deps AS dev
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM deps AS build
COPY . .
RUN npm run build

FROM base AS prod
ENV NODE_ENV=production
COPY --from=build /app/public ./public
COPY --from=build /app/.next ./.next
COPY --from=build /app/package*.json ./
RUN npm install --omit=dev
EXPOSE 3000
CMD ["npm", "run", "start"]
