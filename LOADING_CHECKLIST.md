# Extension Loading Checklist

## ✅ Pre-Loading Verification

Run this checklist before loading the extension in Chrome:

### Required Files Present:

- [ ] `dist/manifest.json` exists and is valid JSON
- [ ] `dist/background.js` exists (service worker)
- [ ] `dist/src/popup/index.html` exists (popup UI)
- [ ] `dist/src/options/index.html` exists (options page)
- [ ] All icon files exist and are valid PNGs:
  - [ ] `dist/icons/icon16.png`
  - [ ] `dist/icons/icon32.png`
  - [ ] `dist/icons/icon48.png`
  - [ ] `dist/icons/icon128.png`

### Quick Verification Commands:

```bash
# Check structure
find dist -type f | sort

# Validate manifest
python3 -c "import json; print('✅ Valid' if json.load(open('dist/manifest.json')) else '❌ Invalid')"

# Check icon files
ls -la dist/icons/

# Verify file sizes (should not be 0 bytes)
du -h dist/icons/*
```

## 🚀 Loading Steps:

1. **Open Chrome Extensions:**

   - Navigate to `chrome://extensions/`

2. **Enable Developer Mode:**

   - Toggle "Developer mode" in the top right

3. **Load Extension:**

   - Click "Load unpacked"
   - Select the `dist/` directory
   - Click "Select"

4. **Verify Loading:**
   - Extension should appear in the list
   - No error messages should be displayed
   - Extension icon should be visible in the Chrome toolbar

## 🔧 If Loading Fails:

1. **Check Console Errors:**

   - Look for detailed error messages in Chrome
   - Check browser console (F12) for JavaScript errors

2. **Rebuild Extension:**

   ```bash
   pnpm run build:extension
   ```

3. **Verify Manifest Paths:**

   - Ensure `background.service_worker` points to `background.js`
   - Ensure popup/options paths match built structure

4. **Check File Permissions:**
   ```bash
   chmod -R 644 dist/
   chmod 755 dist/ dist/icons/ dist/src/ dist/assets/
   ```

## ✅ Success Indicators:

- Extension loads without errors
- Popup opens when clicking extension icon
- Options page accessible via right-click → "Options"
- No console errors in background page
