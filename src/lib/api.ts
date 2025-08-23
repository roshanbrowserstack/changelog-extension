import type {
  GitHubPullRequest,
  ConfluencePage,
  ConfluenceUpdatePage,
  ExtensionSettings,
} from "@/types";

/**
 * Fetch merged pull requests from GitHub repository since a given timestamp
 */
export async function fetchMergedPRs(
  settings: ExtensionSettings
): Promise<GitHubPullRequest[]> {
  const owner = settings.repoOwner;
  const repo = settings.repoName;

  if (!owner || !repo) {
    throw new Error("Repository owner and name are required.");
  }

  const url = new URL(`https://api.github.com/repos/${owner}/${repo}/pulls`);
  url.searchParams.set("state", "closed");
  url.searchParams.set("sort", "updated");
  url.searchParams.set("direction", "desc");
  url.searchParams.set("per_page", "100");

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `token ${settings.githubToken}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "GitHub-Confluence-Extension",
    },
  });

  if (!response.ok) {
    throw new Error(
      `GitHub API error: ${response.status} ${response.statusText}`
    );
  }

  const pullRequests: GitHubPullRequest[] = await response.json();

  // Filter for merged PRs only
  let mergedPRs = pullRequests.filter((pr) => pr.merged_at);

  return mergedPRs;
}

/**
 * Fetch current Confluence page content
 */
export async function fetchConfluencePage(
  settings: ExtensionSettings
): Promise<ConfluencePage> {
  const confluenceUrl = settings.confluenceUrl.startsWith("http")
    ? settings.confluenceUrl
    : `https://${settings.confluenceUrl}`;

  const url = `${confluenceUrl}/wiki/rest/api/content/${settings.pageId}?expand=body.storage,version`;

  const credentials = btoa(
    `${settings.confluenceEmail}:${settings.confluenceToken}`
  );

  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${credentials}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Confluence API error: ${response.status} ${response.statusText}`
    );
  }

  return await response.json();
}

/**
 * Update Confluence page with new content
 */
export async function updateConfluencePage(
  settings: ExtensionSettings,
  pageId: string,
  title: string,
  content: string,
  version: number
): Promise<ConfluencePage> {
  const confluenceUrl = settings.confluenceUrl.startsWith("http")
    ? settings.confluenceUrl
    : `https://${settings.confluenceUrl}`;

  const url = `${confluenceUrl}/wiki/rest/api/content/${pageId}`;

  const credentials = btoa(
    `${settings.confluenceEmail}:${settings.confluenceToken}`
  );

  const updateData: ConfluenceUpdatePage = {
    id: pageId,
    type: "page",
    title: title,
    body: {
      storage: {
        value: content,
        representation: "storage",
      },
    },
    version: {
      number: version + 1,
    },
  };

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Basic ${credentials}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(updateData),
  });

  if (!response.ok) {
    throw new Error(
      `Confluence API error: ${response.status} ${response.statusText}`
    );
  }

  return await response.json();
}

/**
 * Format PR data for Confluence content
 */
export function formatPRForConfluence(pr: GitHubPullRequest): string {
  const mergedDate = pr.merged_at
    ? new Date(pr.merged_at).toLocaleDateString()
    : "Unknown";

  return `
<tr>
  <td><a href="${pr.html_url}">#${pr.number}</a></td>
  <td>${pr.title}</td>
  <td>${pr.user.login}</td>
  <td>${mergedDate}</td>
</tr>`;
}

/**
 * Append PRs to existing Confluence page content
 */
export function appendPRsToContent(
  existingContent: string,
  prs: GitHubPullRequest[]
): string {
  if (prs.length === 0) return existingContent;

  //TODO: Logic should be such that we are checking the existing extension version in confluence page

  // Check if changelog table exists
  const tableRegex = /<table[^>]*>[\s\S]*?<\/table>/i;
  const tableMatch = existingContent.match(tableRegex);

  if (tableMatch) {
    // Table exists, append new rows before closing </table>
    const prRows = prs.map((pr) => formatPRForConfluence(pr)).join("\n");
    return existingContent.replace(/<\/table>/i, `${prRows}\n</table>`);
  } else {
    // No table exists, create a new one
    const tableHeader = `
<h2>Merged Pull Requests</h2>
<table>
  <tr>
    <th>PR #</th>
    <th>Title</th>
    <th>Author</th>
    <th>Merged Date</th>
  </tr>`;

    const prRows = prs.map((pr) => formatPRForConfluence(pr)).join("\n");
    const tableFooter = "</table>";

    const newTable = tableHeader + prRows + tableFooter;

    return existingContent + "\n" + newTable;
  }
}
