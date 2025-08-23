#!/bin/bash

echo "Building Chrome extension..."

# Clean previous build
rm -rf dist

# Build the extension
echo "Running TypeScript compilation and Vite build..."
pnpm run build

# Copy manifest to dist
echo "Copying manifest..."
cp src/manifest.json dist/

# Copy icons from icons directory
echo "Copying icons..."
mkdir -p dist/icons
cp icons/icon16.jpeg dist/icons/
cp icons/icon32.jpeg dist/icons/
cp icons/icon48.jpeg dist/icons/
cp icons/icon128.jpeg dist/icons/

echo ""
echo "✅ Extension built successfully!"
echo "📁 Output directory: dist/"
echo ""
echo "🚀 To load in Chrome:"
echo "   1. Go to chrome://extensions/"
echo "   2. Enable 'Developer mode'"
echo "   3. Click 'Load unpacked'"
echo "   4. Select the 'dist/' directory"
echo ""
