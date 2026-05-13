FROM rust:1.94-bookworm AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock rust-toolchain.toml ./
COPY crates/ ./crates/
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/app/target \
    cargo build --release -p driftbase-edge \
    && cp target/release/driftbase-edge /usr/local/bin/driftbase-edge

FROM caddy:2-alpine
RUN apk add --no-cache ca-certificates iproute2 iptables wireguard-tools
COPY --from=builder /usr/local/bin/driftbase-edge /usr/local/bin/driftbase-edge
ENTRYPOINT ["/usr/local/bin/driftbase-edge"]
