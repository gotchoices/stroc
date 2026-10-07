# Stroc document server.
#   docker build -t stroc-server .
#   docker run -p 3000:3000 -v /path/to/documents:/documents:ro -e STROC_DOMAIN=example.org stroc-server
# Serve behind an HTTPS proxy (Caddy, nginx); author confirmation requires HTTPS on the domain.
# Send SIGHUP (docker kill -s HUP <container>) to reload after changing the documents.

FROM node:20-slim AS build
WORKDIR /src
COPY . .
RUN corepack enable && yarn install --immutable && yarn build

FROM node:20-slim
WORKDIR /app
COPY --from=build /src /app
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
EXPOSE 3000
USER node
ENTRYPOINT ["node", "packages/server/dist/src/bin.js"]
CMD ["/documents"]
