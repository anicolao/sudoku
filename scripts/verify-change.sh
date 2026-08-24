#!/usr/bin/env bash
set -euo pipefail

git diff --cached --check
git diff --check
npm run check:docs
npm run check
npm run test:unit
npm run test:e2e
npm run build
