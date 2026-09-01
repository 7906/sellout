# 《SELL OUT / 成交》单容器镜像：同端口托管 client/dist 静态页 + Fastify API
# 国内网络可覆盖：--build-arg BASE_IMAGE=docker.m.daocloud.io/library/node:24-alpine \
#                 --build-arg NPM_REGISTRY=https://registry.npmmirror.com
ARG BASE_IMAGE=node:24-alpine
FROM ${BASE_IMAGE}

ARG NPM_REGISTRY=https://registry.npmjs.org

WORKDIR /app

# 先装依赖（利用层缓存：仅依赖清单变化时才重装）
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/package.json
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci --registry=${NPM_REGISTRY}

# 再拷源码并构建前端
COPY shared/ shared/
COPY server/ server/
COPY client/ client/
RUN npm run typecheck && npm run build -w client

# 运行时环境变量（容器平台可覆盖；GLM_API_KEY 在控制台里配置，绝不打进镜像）
ENV HOST=0.0.0.0 PORT=3001

EXPOSE 3001
# 存档目录（server/data/save.json）——容器平台把持久卷挂到这里即可跨重启保留进度
CMD ["npm", "run", "start:prod"]
