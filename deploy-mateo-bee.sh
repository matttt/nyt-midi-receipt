#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
image="${IMAGE:-ghcr.io/matttt/nytmidireceipt:latest}"
deploy_host="${DEPLOY_HOST:-matt@mateo-bee.local}"
service="${SERVICE:-nyt-midi-receipt}"
port="${PORT:-6434}"

cd "$script_dir"

# Catch a broken parse/render before it reaches the registry.
node -e '
  const parse = require("./src/parseNYT");
  const puzzle = parse(require("./reference/sampleMidi.json"));
  if (!puzzle.clues.across.length) throw new Error("parse produced no clues");
  require("./src/renderGrid")(puzzle);
  console.log(`smoke ok: ${puzzle.clues.across.length} across, ${puzzle.clues.down.length} down`);
'

# The bee is amd64 and this Mac is arm64. Without --platform, buildx pushes an
# arm64 image the bee cannot run -- which is what made building on the box
# there seem necessary.
docker buildx build \
  --platform linux/amd64 \
  --tag "$image" \
  --push \
  .

# The bee has the standalone docker-compose binary, not the `docker compose` plugin.
ssh "$deploy_host" "
  cd /opt/docker &&
  docker-compose pull $service &&
  docker-compose up -d --no-deps $service &&
  for i in \$(seq 1 20); do
    curl --fail --silent http://127.0.0.1:$port/ >/dev/null && break
    [ \$i = 20 ] && { echo 'service did not come up within 20s'; exit 1; }
    sleep 1
  done &&
  docker inspect --format='{{.Config.Image}} {{.State.Status}}' $service
"

echo "deployed $image to $deploy_host"
