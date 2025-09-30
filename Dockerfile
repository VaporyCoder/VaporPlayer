# Build frontend
FROM node:18 AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Runtime
FROM node:18
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY server.js ./
RUN npm install express cors uuid

ENV MUSIC_DIR=/music
EXPOSE 5174
CMD ["node", "server.js"]
