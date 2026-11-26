# SGP web image: the React build served by nginx, which also forwards /api to
# the API container. Build from the repository root:
#   docker build -f web/Dockerfile .
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci
# The client reuses the API domain rules and types (@dominio, @api aliases).
COPY api/src api/src
COPY api/tsconfig.json api/
COPY web/ web/
RUN npm run build -w web

FROM nginx:1.28-alpine
COPY web/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY web/nginx/cabeceras-seguridad.conf /etc/nginx/snippets/cabeceras-seguridad.conf
COPY --from=build /app/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=5s --timeout=3s --retries=10 CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1/"]
