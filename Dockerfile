FROM nginx:1.28-alpine3.21

# Update package index and explicitly upgrade libxml2 to ensure fixed version
RUN apk update && \
    apt upgrade -y && \
    apk add --no-cache libxml2>=2.13.8 && \
    rm -rf /var/cache/apk/*

RUN apk info libxml2

COPY dist/ /usr/share/nginx/html

# Add custom nginx config to set charset utf-8
RUN echo 'charset utf-8;' > /etc/nginx/conf.d/charset.conf

EXPOSE 80

# Use BuildKit variable TARGETARCH (e.g. amd64 for x86_64, arm64/aarch64 for ARM) to conditionally execute
ARG TARGETARCH

RUN if [ "${TARGETARCH}" = "amd64" ]; then \
      chmod +x /docker-entrypoint.sh; \
    else \
      echo "Skipping chmod for TARGETARCH=${TARGETARCH}"; \
    fi
