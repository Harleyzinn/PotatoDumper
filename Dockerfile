FROM node:24-alpine
WORKDIR /app
COPY package.json server.mjs ./
COPY public ./public
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
USER node
EXPOSE 3000
CMD ["node", "server.mjs"]
