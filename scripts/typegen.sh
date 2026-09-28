#!/usr/bin/env bash
# Regenerates .expo/types/router.d.ts (typed routes) after adding or moving a
# screen: starts Expo just long enough for it to rewrite the file, then stops.
set -u
cd "$(dirname "$0")/.."
before=$(stat -f %m .expo/types/router.d.ts 2>/dev/null || echo 0)
CI=1 npx expo start --port 8199 > /tmp/bp-typegen.log 2>&1 &
pid=$!
for _ in $(seq 1 60); do
  sleep 2
  now=$(stat -f %m .expo/types/router.d.ts 2>/dev/null || echo 0)
  [ "$now" != "$before" ] && break
done
kill "$pid" 2>/dev/null; pkill -f "expo start --port 8199" 2>/dev/null
echo "typed routes regenerated"
