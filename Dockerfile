FROM nginx:alpine
COPY dist/ /usr/share/nginx/html
EXPOSE 80
# Use BuildKit variable TARGETARCH (e.g. amd64 for x86_64, arm64/aarch64 for ARM) to conditionally execute
ARG TARGETARCH

RUN if [ "${TARGETARCH}" = "amd64" ]; then \
      chmod +x /docker-entrypoint.sh; \
    else \
      echo "Skipping chmod for TARGETARCH=${TARGETARCH}"; \
    fi