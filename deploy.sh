#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
REGISTRY="${REGISTRY:-docker.io/andpra70}"
IMAGE_NAME="${IMAGE_NAME:-galleria-virtuale}"
TAG="${TAG:-${1:-latest}}"
IMAGE_REF="${REGISTRY}/${IMAGE_NAME}:${TAG}"

docker build -t "$IMAGE_REF" .
docker push "$IMAGE_REF"

echo "Image published: $IMAGE_REF"
