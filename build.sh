#!/bin/bash

# Build script for Simple Priority Queue Service

echo "Building Simple Priority Queue Service..."

# Clean up previous build
echo "Cleaning up previous build..."
rm -rf dist

# Run TypeScript compiler
echo "Compiling TypeScript..."
npx tsc

# Run tests
echo "Running tests..."
npm test

# Check if build was successful
if [ -d "dist" ]; then
  echo "Build successful! Output is in the dist directory."
else
  echo "Build failed. Check for errors above."
  exit 1
fi

echo "Done!"
