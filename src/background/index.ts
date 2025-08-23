import type {
  ExtensionSettings,
  ExtensionMessage,
  ExtensionResponse,
} from "@/types";
import {
  fetchMergedPRs,
  fetchConfluencePage,
  updateConfluencePage,
  appendPRsToContent,
} from "@/lib/api";

const ALARM_NAME = "pr-checker";
const LAST_CHECKED_KEY = "last-checked-timestamp";

/**
 * Initialize extension on installation
 */
chrome.runtime.onInstalled.addListener(async () => {
  console.log("GitHub to Confluence Extension installed");

  // Create hourly alarm
  await chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: 1, // Start after 1 minute
    periodInMinutes: 60, // Repeat every hour
  });

  console.log("Alarm created: pr-checker");
});

/**
 * Handle alarm events
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    console.log("PR checker alarm triggered");
    await checkAndLogMergedPRs();
  }
});

/**
 * Handle messages from popup
 */
chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    console.log("Background received message:", message);

    // Handle async operations with proper error handling
    const handleAsyncMessage = async () => {
      try {
        if (message.action === "CHECK_PRS") {
          const { count } = await checkAndLogMergedPRs();
          const response: ExtensionResponse = {
            success: true,
            message: "PR check completed",
            data: { count },
          };
          sendResponse(response);
          return;
        }

        if (message.action === "testConnections") {
          if (!message.settings) {
            const errorResponse = {
              success: false,
              error: "Settings not provided",
            };
            console.log("Sending error response:", errorResponse);
            sendResponse(errorResponse);
            return;
          }

          console.log("Testing connections with settings...");
          const result = await testConnections(message.settings);
          console.log("Test result:", result);
          sendResponse(result);
          return;
        }

        // Unknown action
        sendResponse({
          success: false,
          error: "Unknown action: " + message.action,
        });
      } catch (error: any) {
        console.error("Error handling message:", error);
        const errorResponse = {
          success: false,
          error: error.message || "Unknown error occurred",
        };
        sendResponse(errorResponse);
      }
    };

    // Handle the async operation
    handleAsyncMessage().catch((error) => {
      console.error("Unhandled error in message handler:", error);
      sendResponse({
        success: false,
        error: "Internal error occurred",
      });
    });

    // Return true to indicate we'll send a response asynchronously
    return true;
  }
);

/**
 * Main function to check for merged PRs and log them to Confluence
 */
async function checkAndLogMergedPRs(): Promise<{ count: number }> {
  try {
    // Get settings from storage
    const result = await chrome.storage.sync.get([
      "githubToken",
      "repoOwner",
      "repoName",
      "confluenceUrl",
      "confluenceEmail",
      "confluenceToken",
      "pageId",
      LAST_CHECKED_KEY,
    ]);

    const settings: ExtensionSettings = {
      githubToken: result.githubToken || "",
      repoOwner: result.repoOwner || "",
      repoName: result.repoName || "",
      confluenceUrl: result.confluenceUrl || "",
      confluenceEmail: result.confluenceEmail || "",
      confluenceToken: result.confluenceToken || "",
      pageId: result.pageId || "",
    };

    const lastChecked: string = result[LAST_CHECKED_KEY];

    if (!settings || !isSettingsComplete(settings)) {
      throw new Error("Incomplete settings");
    }

    console.log("Checking for merged PRs since:", lastChecked || "beginning");

    // Fetch merged PRs from GitHub
    const mergedPRs = await fetchMergedPRs(settings);

    if (mergedPRs.length === 0) {
      console.log("No new merged PRs found");
      await showNotification(
        "No New PRs",
        "No new merged pull requests found.",
        "basic"
      );
      return { count: 0 };
    }

    console.log(`Found ${mergedPRs.length} new merged PRs`);

    // Fetch current Confluence page
    const confluencePage = await fetchConfluencePage(settings);

    // Append PR data to page content
    const updatedContent = appendPRsToContent(
      confluencePage.body.storage.value,
      mergedPRs
    );

    // Update Confluence page
    await updateConfluencePage(
      settings,
      confluencePage.id,
      confluencePage.title,
      updatedContent,
      confluencePage.version.number
    );

    // Update last checked timestamp with the most recent PR merge time
    const latestMergeTime = mergedPRs.reduce((latest, pr) => {
      if (!pr.merged_at) return latest;
      const mergeTime = new Date(pr.merged_at);
      return mergeTime > latest ? mergeTime : latest;
    }, new Date(0));

    await chrome.storage.sync.set({
      [LAST_CHECKED_KEY]: latestMergeTime.toISOString(),
    });

    // Show success notification
    await showNotification(
      "Success",
      `Logged ${mergedPRs.length} new PR(s) to Confluence`,
      "basic"
    );

    console.log("Successfully logged PRs to Confluence");
    return { count: mergedPRs.length };
  } catch (error) {
    console.error("Error checking PRs:", error);

    await showNotification(
      "Error",
      `Failed to check PRs: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
      "basic"
    );
    return { count: 0 };
  }
}

/**
 * Check if all required settings are configured
 */
function isSettingsComplete(settings: ExtensionSettings): boolean {
  return !!(
    settings.repoOwner &&
    settings.repoName &&
    settings.githubToken &&
    settings.confluenceUrl &&
    settings.pageId &&
    settings.confluenceEmail &&
    settings.confluenceToken
  );
}

/**
 * Test GitHub and Confluence connections
 */
async function testConnections(
  settings: ExtensionSettings
): Promise<ExtensionResponse> {
  try {
    // Test GitHub connection
    const githubTest = await testGitHubConnection(settings);
    if (!githubTest.success) {
      return githubTest;
    }

    // Test Confluence connection
    const confluenceTest = await testConfluenceConnection(settings);
    if (!confluenceTest.success) {
      return confluenceTest;
    }

    return {
      success: true,
      message: "All connections successful!",
    };
  } catch (error) {
    return {
      success: false,
      message: "Connection test failed",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Test GitHub API connection
 */
async function testGitHubConnection(
  settings: ExtensionSettings
): Promise<ExtensionResponse> {
  try {
    const owner = settings.repoOwner.trim();
    const repo = settings.repoName.trim();
    const token = settings.githubToken.trim();

    if (!owner || !repo || !token) {
      return {
        success: false,
        message: "Repository owner, name, and GitHub token are required",
      };
    }

    console.log(`Testing GitHub connection for ${owner}/${repo}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "GitHub-Confluence-Extension/1.0",
        },
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorMessage = `GitHub API error: ${response.status} ${response.statusText}`;

      if (response.status === 401) {
        errorMessage = "GitHub token is invalid or expired";
      } else if (response.status === 404) {
        errorMessage = `Repository ${owner}/${repo} not found or no access`;
      } else if (response.status === 403) {
        errorMessage =
          "GitHub API rate limit exceeded or insufficient permissions";
      }

      return {
        success: false,
        message: errorMessage,
      };
    }

    const repoData = await response.json();
    console.log(`GitHub connection successful for ${repoData.full_name}`);

    return {
      success: true,
      message: `GitHub connection successful for ${repoData.full_name}`,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        success: false,
        message: "GitHub connection timed out",
      };
    }

    return {
      success: false,
      message: "GitHub connection failed",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Test Confluence API connection
 */
async function testConfluenceConnection(
  settings: ExtensionSettings
): Promise<ExtensionResponse> {
  try {
    const email = settings.confluenceEmail.trim();
    const token = settings.confluenceToken.trim();
    const pageId = settings.pageId.trim();
    let confluenceUrl = settings.confluenceUrl.trim();

    if (!email || !token || !pageId || !confluenceUrl) {
      return {
        success: false,
        message: "All Confluence settings are required",
      };
    }

    // Ensure URL format
    if (!confluenceUrl.startsWith("http")) {
      confluenceUrl = `https://${confluenceUrl}`;
    }

    // Remove trailing slash if present
    confluenceUrl = confluenceUrl.replace(/\/$/, "");

    console.log(`Testing Confluence connection for page ${pageId}`);

    const auth = btoa(`${email}:${token}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

    const response = await fetch(
      `${confluenceUrl}/wiki/rest/api/content/${pageId}`,
      {
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
          "User-Agent": "GitHub-Confluence-Extension/1.0",
        },
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorMessage = `Confluence API error: ${response.status} ${response.statusText}`;

      if (response.status === 401) {
        errorMessage = "Confluence credentials are invalid";
      } else if (response.status === 404) {
        errorMessage = `Confluence page ${pageId} not found or no access`;
      } else if (response.status === 403) {
        errorMessage = "Insufficient permissions to access Confluence page";
      }

      return {
        success: false,
        message: errorMessage,
      };
    }

    const pageData = await response.json();
    console.log(`Confluence connection successful for page: ${pageData.title}`);

    return {
      success: true,
      message: `Confluence connection successful for page: ${pageData.title}`,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        success: false,
        message: "Confluence connection timed out",
      };
    }

    return {
      success: false,
      message: "Confluence connection failed",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
async function showNotification(
  title: string,
  message: string,
  type: "basic" | "image" | "list" | "progress" = "basic"
): Promise<void> {
  // Create notification with minimal requirements to avoid image loading issues
  const iconPath = "icons/icon48.jpeg";
  const fullIconUrl = chrome.runtime.getURL(iconPath);

  const notificationOptions = {
    type: type,
    title: title,
    message: message,
    iconUrl: fullIconUrl,
  };

  await chrome.notifications.create(notificationOptions);
}
