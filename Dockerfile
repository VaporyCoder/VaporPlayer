# ---- Build frontend ----
FROM node:18-alpine as build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .
RUN npm run build

# ---- Run backend ----
FROM node:18-alpine

WORKDIR /app

COPY --from=build /app/dist ./dist
COPY server.mjs .
COPY package.json package-lock.json ./
RUN npm install --production

EXPOSE 5174

CMD ["node", "server.mjs"]
