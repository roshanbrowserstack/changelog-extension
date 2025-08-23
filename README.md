# GitHub to Confluence Changelog Extension

A Chrome extension that monitors a GitHub repository for merged pull requests and automatically logs them to a designated Confluence page.

## Features

- 🔄 **Automatic Monitoring**: Checks for new merged PRs every hour
- 📝 **Confluence Integration**: Automatically appends PR details to a Confluence page
- ⚡ **Manual Trigger**: Check for PRs on-demand via the popup
- 🔒 **Secure Storage**: Settings stored securely using Chrome's storage API
- 🎯 **TypeScript**: Full type safety for API interactions

## Setup Instructions

### Prerequisites

- Node.js (v18 or higher)
- Chrome browser
- GitHub Personal Access Token
- Confluence API Token

### Installation

1. **Clone and Install Dependencies**

   ```bash
   git clone <repository-url>
   cd changelog-extension
   pnpm install
   ```

2. **Build the Extension**

   ```bash
   pnpm run build
   ```

3. **Load in Chrome**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (top right toggle)
   - Click "Load unpacked" and select the `dist` folder

### Configuration

1. **GitHub Setup**

   - Go to [GitHub Settings > Personal Access Tokens](https://github.com/settings/tokens)
   - Generate a new token with `repo` scope (or `public_repo` for public repositories)
   - Note down the token

2. **Confluence Setup**

   - Go to [Atlassian API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
   - Create a new API token
   - Find your Confluence page ID from the page URL (e.g., `/pages/123456789/page-title`)

3. **Extension Configuration**
   - Right-click the extension icon and select "Options"
   - Fill in all required fields:
     - GitHub Repository (format: `owner/repo`)
     - GitHub Personal Access Token
     - Confluence Domain (e.g., `your-company.atlassian.net`)
     - Confluence Page ID
     - Your Confluence email
     - Confluence API Token
   - Click "Test Configuration" to verify settings
   - Click "Save Settings"

## Usage

### Automatic Monitoring

The extension automatically checks for merged PRs every hour and logs new ones to Confluence.

### Manual Check

Click the extension icon and press "Check for Merged PRs Now" to trigger an immediate check.

### Confluence Output

The extension will create or append to a table on your Confluence page with the following format:

| PR #         | Title                          | Author   | Merged Date |
| ------------ | ------------------------------ | -------- | ----------- |
| [#123](link) | Feature: Add new functionality | username | 8/15/2025   |

## Development

### Project Structure

```
src/
├── background/          # Service worker
│   └── index.ts
├── popup/              # Extension popup
│   ├── index.html
│   ├── popup.css
│   └── popup.ts
├── options/            # Settings page
│   ├── index.html
│   ├── options.css
│   └── options.ts
├── lib/               # Utility functions
│   └── api.ts
├── types/             # TypeScript definitions
│   └── index.ts
└── manifest.json      # Extension manifest
```

### Available Scripts

- `pnpm run dev:watch` - Start development with auto-rebuild and file watching
- `pnpm run build` - Build production version
- `pnpm run type-check` - Run TypeScript type checking

### Development Workflow

For development with automatic rebuilding:

1. **Start Development Mode**

   ```bash
   pnpm run dev:watch
   ```

2. **Load Extension in Chrome**

   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `dist` folder

3. **Make Changes**
   - Edit source files in `src/`
   - Files are automatically rebuilt
   - Reload the extension in Chrome to see changes

The development script will:

- ✅ Build extension files automatically when you save
- ✅ Copy manifest and icons to dist/
- ✅ Watch for file changes
- ✅ Show build status in terminal

### API Documentation

#### GitHub API

- Endpoint: `GET /repos/{owner}/{repo}/pulls?state=closed`
- Authentication: Personal Access Token
- Filters merged PRs since last check

#### Confluence API

- Get Page: `GET /wiki/rest/api/content/{pageId}?expand=body.storage,version`
- Update Page: `PUT /wiki/rest/api/content/{pageId}`
- Authentication: Basic Auth (email + API token)

## Troubleshooting

### Common Issues

1. **"Configuration Required" notification**

   - Ensure all settings are filled in the options page
   - Test configuration to verify API access

2. **GitHub API errors**

   - Check if your PAT has correct permissions
   - Verify repository name format (`owner/repo`)
   - Ensure repository exists and you have access

3. **Confluence API errors**

   - Verify your API token is valid
   - Check if you have edit permissions on the target page
   - Ensure page ID is correct

4. **Extension not checking automatically**
   - Check if alarms permission is granted
   - Look for errors in the console (`chrome://extensions/` > extension details > background page)

### Debug Mode

To enable debug logging:

1. Go to `chrome://extensions/`
2. Click on your extension's "Details"
3. Click "background page" under "Inspect views"
4. Check the console for detailed logs

## Security Notes

- All sensitive data (tokens, credentials) is stored securely using Chrome's `storage.sync` API
- API tokens are never logged or exposed in the UI
- Network requests are made only to GitHub and Confluence APIs

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
