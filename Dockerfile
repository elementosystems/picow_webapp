FROM nginx:1.28-alpine3.21

# Update package index and explicitly upgrade libxml2 to ensure fixed version
RUN apk update && \
    apk add --no-cache libxml2 && \
    rm -rf /var/cache/apk/*

COPY dist/ /usr/share/nginx/html
EXPOSE 80

# Use BuildKit variable TARGETARCH (e.g. amd64 for x86_64, arm64/aarch64 for ARM) to conditionally execute
ARG TARGETARCH

RUN if [ "${TARGETARCH}" = "amd64" ]; then \
      chmod +x /docker-entrypoint.sh; \
    else \
      echo "Skipping chmod for TARGETARCH=${TARGETARCH}"; \
    fi