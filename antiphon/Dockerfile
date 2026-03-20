FROM node:20

WORKDIR /app

# install pnpm
RUN corepack enable

# copy only needed files first (faster + safer)
COPY package.json pnpm-lock.yaml* ./

RUN pnpm install

# copy rest of project
COPY . .

EXPOSE 3000

CMD ["pnpm", "start"]
