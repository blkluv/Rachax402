FROM node:20

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml* ./

RUN pnpm install --prod=false

COPY . .

EXPOSE 3000

CMD ["pnpm", "start"]
