#!/bin/bash

# Check if zip flag is passed
CREATE_ZIP=${1:-false}

if [ "$CREATE_ZIP" = "zip" ]; then
  echo "Building Chrome extension for Chrome Web Store..."
  # Clean previous build and zip
  rm -rf dist
  rm -f extension.zip
else
  echo "Building Chrome extension..."
  # Clean previous build
  rm -rf dist
fi

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

if [ "$CREATE_ZIP" = "zip" ]; then
  # Remove any development files that shouldn't be in production
  echo "Cleaning up development files..."
  find dist -name "*.map" -delete
  find dist -name ".DS_Store" -delete

  # Create zip file for Chrome Web Store
  echo "Creating extension.zip for Chrome Web Store upload..."
  cd dist
  zip -r ../extension.zip . -x "*.DS_Store" "*.map"
  cd ..

  echo ""
  echo "✅ Extension packaged successfully!"
  echo "📁 Build directory: dist/"
  echo "📦 Chrome Web Store package: extension.zip"
  echo ""
  echo "🚀 To upload to Chrome Web Store:"
  echo "   1. Go to https://chrome.google.com/webstore/devconsole/"
  echo "   2. Select your extension"
  echo "   3. Upload the 'extension.zip' file"
  echo ""
else
  echo ""
  echo "✅ Extension built successfully!"
  echo "📁 Output directory: dist/"
  echo ""
  echo "🚀 To load in Chrome (development):"
  echo "   1. Go to chrome://extensions/"
  echo "   2. Enable 'Developer mode'"
  echo "   3. Click 'Load unpacked'"
  echo "   4. Select the 'dist/' directory"
  echo ""
fi
