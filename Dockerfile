FROM node:24-bookworm-slim AS build
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/tsconfig*.json ./
COPY backend/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/backend/node_modules ./backend/node_modules
COPY --from=build --chown=node:node /app/backend/dist ./backend/dist
COPY --chown=node:node backend/package.json ./backend/package.json
COPY --chown=node:node backend/scripts ./backend/scripts
COPY --chown=node:node backend/public ./backend/public
COPY --chown=node:node database ./database
USER node
WORKDIR /app/backend
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=8s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/v1/health/database').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node","dist/server.js"]
