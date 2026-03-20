FROM node:20

WORKDIR /app

COPY . .

RUN corepack enable && pnpm install

EXPOSE 3000

CMD ["pnpm", "start"]
