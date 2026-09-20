#!/usr/bin/env bash
set -euo pipefail

REGISTRY="${REGISTRY:-docker.io/andpra70}"
IMAGE_NAME="${IMAGE_NAME:-galleria-virtuale}"
TAG="${TAG:-latest}"
CONTAINER_NAME="${CONTAINER_NAME:-galleria-virtuale}"
HOST_PORT="${HOST_PORT:-6060}"
CONTAINER_PORT="${CONTAINER_PORT:-8080}"
IMAGE_REF="${REGISTRY}/${IMAGE_NAME}:${TAG}"

if docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
  docker stop "$CONTAINER_NAME" >/dev/null
  docker rm "$CONTAINER_NAME" >/dev/null
fi

docker pull "$IMAGE_REF"
docker run -d --name "$CONTAINER_NAME" --restart unless-stopped -p "${HOST_PORT}:${CONTAINER_PORT}" "$IMAGE_REF"

echo "Container $CONTAINER_NAME started from $IMAGE_REF on http://localhost:$HOST_PORT"
