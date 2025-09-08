#!/bin/bash

echo "🚀 Starting Chrome Extension Development Mode..."
echo ""

# Function to copy manifest and icons
copy_static_files() {
    echo "📁 Copying manifest and icons..."
    
    # Create dist directory if it doesn't exist
    mkdir -p dist/icons
    
    # Copy manifest.json
    cp src/manifest.json dist/
    
    # Copy icons
    cp icons/*.jpeg dist/icons/ 2>/dev/null || cp icons/*.jpg dist/icons/ 2>/dev/null || cp icons/*.png dist/icons/ 2>/dev/null || true
    
    echo "✅ Static files copied"
}

# Initial copy of static files
copy_static_files

# Start vite build in watch mode in background
echo "🔨 Starting Vite build in watch mode with sourcemaps..."
pnpm vite build --watch --mode development --sourcemap &
VITE_PID=$!

# Watch for changes to manifest.json and icons
echo "👀 Watching for manifest and icon changes..."
echo ""
echo "📝 Next steps:"
echo "1. Go to chrome://extensions/"
echo "2. Enable Developer mode"
echo "3. Click 'Load unpacked' and select the 'dist' folder"
echo "4. After making changes, reload the extension in Chrome"
echo ""
echo "Press Ctrl+C to stop the development server"
echo ""

# Function to handle cleanup
cleanup() {
    echo ""
    echo "🛑 Stopping development server..."
    kill $VITE_PID 2>/dev/null
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Watch for manifest and icon changes
while true; do
    # Check if manifest.json has changed (simple approach)
    if [ src/manifest.json -nt dist/manifest.json ] 2>/dev/null; then
        echo "🔄 Manifest changed, copying..."
        copy_static_files
    fi
    
    # Check if any icon has changed
    if find icons -name "*.jpeg" -newer dist/icons/icon16.jpeg 2>/dev/null | grep -q .; then
        echo "🔄 Icons changed, copying..."
        copy_static_files
    fi
    
    sleep 2
done
