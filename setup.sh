#!/usr/bin/env bash
set -e
echo "=== CollabSpace Full-Stack Setup ==="
if [ ! -f backend/.env ]; then
  cp .env.example backend/.env
  echo "Created backend/.env from .env.example"
fi
echo "1. Installing backend packages..."
 (cd backend && npm install)
echo "2. Installing frontend packages..."
 (cd frontend && npm install)
echo "Setup complete! Run 'cd backend && npm run dev' and 'cd frontend && npm run dev'."
