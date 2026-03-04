#!/usr/bin/env bash
set -e

docker run -d --name galleria-virtuale -p 6060:80 docker.io/andpra70/galleria-virtuale:latest
