FROM node:22-alpine AS builder

WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
COPY prisma ./prisma/

RUN npm ci

COPY . .

RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app

RUN apk add --no-cache openssl wget

COPY package.json package-lock.json ./
COPY prisma ./prisma/

# Include dev deps so Prisma migrate/seed work in the entrypoint (prototype image).
RUN npm ci --include=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY docker-entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh

RUN chmod +x /entrypoint.sh

ENV DATABASE_URL="file:/data/dev.db"
ENV PORT=3000

EXPOSE 3000

ENTRYPOINT ["/entrypoint.sh"]
