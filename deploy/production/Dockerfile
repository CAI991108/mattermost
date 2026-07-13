# syntax=docker/dockerfile:1.12

ARG NODE_IMAGE=node:24.11.1-bookworm-slim@sha256:48abc13a19400ca3985071e287bd405a1d99306770eb81d61202fb6b65cf0b57
ARG GO_IMAGE=golang:1.26.3-bookworm@sha256:386d475a660466863d9f8c766fec64d7fdad3edac2c6a05020c09534d71edb4b
ARG RUNTIME_IMAGE=debian:bookworm-slim@sha256:60eac759739651111db372c07be67863818726f754804b8707c90979bda511df

FROM ${NODE_IMAGE} AS node-toolchain

FROM ${GO_IMAGE} AS builder
COPY --from=node-toolchain /usr/local/ /usr/local/

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install --no-install-recommends -y \
        ca-certificates \
        build-essential \
        curl \
        git \
        gnupg \
        libatomic1 \
        make \
        python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
# Keep the expensive npm dependency layer keyed only by lockfiles and workspace
# manifests. Source-only IUIN fixes can then reuse node_modules during rebuilds.
COPY webapp/package.json webapp/package-lock.json ./webapp/
COPY webapp/channels/package.json ./webapp/channels/
COPY webapp/platform/client/package.json ./webapp/platform/client/
COPY webapp/platform/components/package.json ./webapp/platform/components/
COPY webapp/platform/eslint-plugin/package.json ./webapp/platform/eslint-plugin/
COPY webapp/platform/mattermost-redux/package.json ./webapp/platform/mattermost-redux/
COPY webapp/platform/shared/package.json ./webapp/platform/shared/
COPY webapp/platform/types/package.json ./webapp/platform/types/

RUN --mount=type=cache,target=/root/.npm \
    cd webapp \
    && npm ci --include=dev --ignore-scripts \
    && touch node_modules

COPY webapp/ ./webapp/

RUN cd webapp \
    && npm run postinstall \
    && npm run build

COPY server/ ./server/
COPY NOTICE.txt README.md LICENSE.txt ./

ARG BUILD_HASH=unknown
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    make -C server \
      BUILD_ENTERPRISE=false \
      BUILD_NUMBER=11.8.3-iuin \
      BUILD_HASH="${BUILD_HASH}" \
      build-linux-amd64

# Package only the source-built Team server and the pinned Calls plugin. The
# upstream package target imports Mattermost's plugin signing key and verifies
# the downloaded Calls archive signature before placing it in prepackaged_plugins.
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    make -C server \
      BUILD_ENTERPRISE=false \
      BUILD_NUMBER=11.8.3-iuin \
      BUILD_HASH="${BUILD_HASH}" \
      PLUGIN_PACKAGES=mattermost-plugin-calls-v1.11.5 \
      package-linux-amd64 \
    && mkdir -p /out \
    && tar -xzf server/dist/mattermost-team-linux-amd64.tar.gz -C /out \
    && test -x /out/mattermost/bin/mattermost \
    && test -x /out/mattermost/bin/mmctl \
    && test -f /out/mattermost/prepackaged_plugins/mattermost-plugin-calls-v1.11.5-linux-amd64.tar.gz \
    && test -f /out/mattermost/prepackaged_plugins/mattermost-plugin-calls-v1.11.5-linux-amd64.tar.gz.sig

FROM ${RUNTIME_IMAGE} AS runtime

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install --no-install-recommends -y \
        ca-certificates \
        curl \
        media-types \
        poppler-utils \
        tidy \
        tzdata \
        unrtf \
        wv \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 2000 mattermost \
    && useradd --uid 2000 --gid 2000 --home-dir /mattermost --no-create-home --shell /usr/sbin/nologin mattermost

COPY --from=builder --chown=2000:2000 /out/mattermost/ /mattermost/
RUN install -d -m 0755 /opt/iuin \
    && cp /mattermost/config/config.json /opt/iuin/default-config.json \
    && chown 2000:2000 /opt/iuin/default-config.json \
    && chmod 0600 /opt/iuin/default-config.json \
    && install -d -o 2000 -g 2000 -m 0750 \
        /mattermost/config \
        /mattermost/data \
        /mattermost/logs \
        /mattermost/plugins \
        /mattermost/client/plugins

COPY --chown=2000:2000 deploy/production/entrypoint.sh /usr/local/bin/iuin-entrypoint
RUN chmod 0755 /usr/local/bin/iuin-entrypoint

ENV PATH=/mattermost/bin:${PATH} \
    MM_INSTALL_TYPE=docker

USER 2000:2000
WORKDIR /mattermost
ENTRYPOINT ["/usr/local/bin/iuin-entrypoint"]
CMD ["/mattermost/bin/mattermost"]

EXPOSE 8065/tcp 8443/tcp 8443/udp
