FROM node:24-bookworm-slim AS frontend
WORKDIR /web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build
FROM httpd:2.4-alpine
COPY infra/apache/httpd.conf /usr/local/apache2/conf/httpd.conf
COPY --from=frontend /web/dist/ /usr/local/apache2/htdocs/
