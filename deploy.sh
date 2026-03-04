#!/usr/bin/env bash
set -e

docker build -t docker.io/andpra70/galleria-virtuale:latest .
docker push docker.io/andpra70/galleria-virtuale:latest
