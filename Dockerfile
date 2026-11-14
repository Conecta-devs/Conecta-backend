# syntax=docker/dockerfile:1
#
# Imagem de container para o Vercel (Container Runtime).
# Requer o Framework Preset do projeto no Vercel definido como
# "Container"/"Docker" (a detecção automática de NestJS não é sobrepujada
# só pela presença deste arquivo — mudar o preset nas configurações).

# --- Estágio 1: instalar dependências e compilar -------------------------
FROM node:24-slim AS build
WORKDIR /app

# Aproveita cache do Docker: só reinstala quando o lockfile muda
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build
# Remove devDependencies (CLI do Nest, vitest, prisma CLI etc.) do runtime
RUN npm prune --omit=dev

# --- Estágio 2: imagem final, só o que o servidor precisa ----------------
FROM node:24-slim
WORKDIR /app

ENV NODE_ENV=production
# O Container Runtime do Vercel roteia tráfego para a porta 80 por padrão.
# main.ts lê process.env.PORT, então basta definir aqui.
ENV PORT=80

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

EXPOSE 80
CMD ["node", "dist/main.js"]
