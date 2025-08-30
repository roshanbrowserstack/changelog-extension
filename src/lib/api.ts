import type {
  GitHubPullRequest,
  GitHubUser,
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
 * Extract version from PR title or body
 */
function extractVersionFromPR(pr: GitHubPullRequest): string {
  // Common version patterns: v1.2.3, version 1.2.3, 1.2.3, etc.
  const versionRegex =
    /(?:v|version\s*)?(\d+\.\d+(?:\.\d+)?(?:-[a-zA-Z0-9-]+)?)/i;

  // Check title first
  const titleMatch = pr.title.match(versionRegex);
  if (titleMatch) {
    return titleMatch[1];
  }

  // Check body if title doesn't contain version
  if (pr.body) {
    const bodyMatch = pr.body.match(versionRegex);
    if (bodyMatch) {
      return bodyMatch[1];
    }
  }

  // Return empty string if no version found
  return "";
}

/**
 * Extract changelog information from PR body
 */
function extractChangelogFromPR(pr: GitHubPullRequest): string {
  if (!pr.body) return "";

  // Look for changelog section in PR body
  const changelogRegex =
    /(?:changelog|change\s*log|changes?):\s*(.+?)(?:\n\n|\n---|$)/is;
  const match = pr.body.match(changelogRegex);

  if (match) {
    return match[1].trim();
  }

  // If no explicit changelog section, use the first line of description
  const lines = pr.body.split("\n").filter((line) => line.trim());
  return lines.length > 0 ? lines[0].trim() : pr.title;
}

/**
 * Parse date string in various formats commonly used in tables
 */
function parseTableDate(dateString: string): Date | null {
  if (!dateString) return null;

  // Try parsing common date formats
  const formats = [
    // MM/DD/YYYY
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    // DD/MM/YYYY
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    // YYYY-MM-DD
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
    // DD-MM-YYYY
    /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
  ];

  // First try native Date parsing
  let date = new Date(dateString);
  if (!isNaN(date.getTime())) {
    return date;
  }

  // If that fails, try manual parsing for common formats
  for (const format of formats) {
    const match = dateString.match(format);
    if (match) {
      // Assume MM/DD/YYYY format for ambiguous cases
      const [, part1, part2, part3] = match;
      if (part3.length === 4) {
        // Year is last
        date = new Date(parseInt(part3), parseInt(part1) - 1, parseInt(part2));
      } else {
        // Year is first (YYYY-MM-DD)
        date = new Date(parseInt(part1), parseInt(part2) - 1, parseInt(part3));
      }

      if (!isNaN(date.getTime())) {
        return date;
      }
    }
  }

  return null;
}

/**
 * Parse existing table to find the latest version and release date
 */
function getLatestEntryFromTable(content: string): {
  version: string;
  releaseDate: string;
  entries: {
    version: string;
    releaseDate: string;
    rawDate: Date;
    prNumber?: number;
  }[];
} {
  // Find the table content
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/i;
  const tableMatch = content.match(tableRegex);

  if (!tableMatch) return { version: "", releaseDate: "", entries: [] };

  const tableContent = tableMatch[1];

  // Extract all rows with their version and release date
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const entries: {
    version: string;
    releaseDate: string;
    rawDate: Date;
    prNumber?: number;
  }[] = [];

  let rowMatch;
  while ((rowMatch = rowRegex.exec(tableContent)) !== null) {
    const row = rowMatch[1];
    // Skip header rows
    if (row.includes("<th")) continue;

    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells: string[] = [];
    let cellMatch;

    while ((cellMatch = cellRegex.exec(row)) !== null) {
      // Remove HTML tags and get text content
      const cellContent = cellMatch[1].replace(/<[^>]*>/g, "").trim();
      cells.push(cellContent);
    }

    // Based on table structure: Type, Version, PR, Developer, Change Log, Status, Release Date, Artifact Link
    // Version is in index 1, PR is in index 2, Release Date is in index 6
    if (cells.length > 6 && cells[1] && cells[6]) {
      const version = cells[1];
      const releaseDate = cells[6];
      const prCell = cells[2]; // Contains PR link like "#123"

      // Extract PR number from the PR cell (e.g., "#123" -> 123)
      let prNumber: number | undefined;
      const prMatch = prCell.match(/#(\d+)/);
      if (prMatch) {
        prNumber = parseInt(prMatch[1]);
      }

      // Parse the release date using our helper function
      const parsedDate = parseTableDate(releaseDate);

      // Only include valid entries
      if (version && releaseDate && parsedDate) {
        entries.push({
          version,
          releaseDate,
          rawDate: parsedDate,
          prNumber,
        });
      }
    }
  }

  if (entries.length === 0)
    return { version: "", releaseDate: "", entries: [] };

  // Sort by release date (most recent first) and then by version if dates are the same
  entries.sort((a, b) => {
    const dateComparison = b.rawDate.getTime() - a.rawDate.getTime();
    if (dateComparison !== 0) return dateComparison;

    // If dates are the same, compare versions
    const partsA = a.version.split(".").map(Number);
    const partsB = b.version.split(".").map(Number);

    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const partA = partsA[i] || 0;
      const partB = partsB[i] || 0;
      if (partA !== partB) return partB - partA; // Descending order
    }
    return 0;
  });

  return {
    version: entries[0].version,
    releaseDate: entries[0].releaseDate,
    entries: entries,
  };
}

/**
 * Compare version strings
 */
function isNewerVersion(version1: string, version2: string): boolean {
  if (!version1 || !version2) return true; // If either is missing, consider it new

  const parts1 = version1.split(".").map(Number);
  const parts2 = version2.split(".").map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;

    if (part1 > part2) return true;
    if (part1 < part2) return false;
  }

  return false; // Same version
}

/**
 * Format PR data for the new Confluence table structure
 */
export function formatPRForConfluence(pr: GitHubPullRequest): string {
  const version = extractVersionFromPR(pr);
  const changelog = extractChangelogFromPR(pr);
  const mergedDate = pr.merged_at
    ? new Date(pr.merged_at).toLocaleDateString()
    : new Date().toLocaleDateString();

  const developer = pr.user.login;
  const prLink = `<a href="${pr.html_url}">#${pr.number}</a>`;

  // Try to extract artifact link from PR body (look for common patterns)
  let artifactLink = "";
  if (pr.body) {
    const artifactRegex =
      /(?:artifact|build|release)\s*(?:link|url):\s*([^\s\n]+)/i;
    const match = pr.body.match(artifactRegex);
    if (match) {
      artifactLink = `<a href="${match[1]}">${match[1]}</a>`;
    }
  }

  return `
<tr>
  <td>Minor</td>
  <td>${version}</td>
  <td>${prLink}</td>
  <td>${developer}</td>
  <td>${changelog}</td>
  <td>Released</td>
  <td>${mergedDate}</td>
  <td>${artifactLink}</td>
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

  // Get the latest version and release date from the existing table
  const latestEntry = getLatestEntryFromTable(existingContent);

  // Filter PRs to only include those with newer versions or no version info (but newer release date)
  const newPRs = prs.filter((pr) => {
    const prVersion = extractVersionFromPR(pr);
    const prReleaseDate = pr.merged_at ? new Date(pr.merged_at) : new Date();

    // If PR has version, check if it's newer
    if (prVersion) {
      // If table has no versions, include it
      if (!latestEntry.version) return true;

      // Only include if PR version is newer
      return isNewerVersion(prVersion, latestEntry.version);
    }

    // If PR has no version, include only if its release date is newer than latest entry
    if (!latestEntry.releaseDate) return true; // No entries in table yet

    const latestEntryDate = new Date(latestEntry.releaseDate);

    // Only proceed if PR release date is newer than latest entry
    if (prReleaseDate > latestEntryDate) {
      // Iterate over latestEntry.entries and check if PR is not present in any of them
      const isPRAlreadyInTable = latestEntry.entries.some((entry) => {
        // Check if this entry corresponds to the current PR by comparing PR numbers
        return entry.prNumber === pr.number;
      });

      return !isPRAlreadyInTable;
    }

    return false;
  });

  if (newPRs.length === 0) return existingContent;

  // Check if changelog table exists
  const tableRegex = /<table[^>]*>[\s\S]*?<\/table>/i;
  const tableMatch = existingContent.match(tableRegex);

  if (tableMatch) {
    // Table exists, append new rows before closing </table>
    const prRows = newPRs.map((pr) => formatPRForConfluence(pr)).join("\n");
    return existingContent.replace(/<\/table>/i, `${prRows}\n</table>`);
  } else {
    // No table exists, create a new one with the proper headers
    const tableHeader = `
<h2>Changelog</h2>
<table>
  <tr>
    <th>Type</th>
    <th>Version</th>
    <th>PR</th>
    <th>Developer / QA</th>
    <th>Change Log</th>
    <th>Status</th>
    <th>Release Date</th>
    <th>Artifact Link</th>
  </tr>`;

    const prRows = newPRs.map((pr) => formatPRForConfluence(pr)).join("\n");
    const tableFooter = "</table>";

    const newTable = tableHeader + prRows + tableFooter;

    return existingContent + "\n" + newTable;
  }
}

/**
 * Test function to fetch and analyze a specific Confluence page
 */
export async function analyzeConfluencePage(
  settings: ExtensionSettings,
  pageId: string = "4841177169"
): Promise<{
  hasTable: boolean;
  latestVersion: string;
  latestReleaseDate: string;
  tableStructure: string[];
  rowCount: number;
}> {
  const tempSettings = { ...settings, pageId };
  const page = await fetchConfluencePage(tempSettings);

  const content = page.body.storage.value;
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/i;
  const tableMatch = content.match(tableRegex);

  if (!tableMatch) {
    return {
      hasTable: false,
      latestVersion: "",
      latestReleaseDate: "",
      tableStructure: [],
      rowCount: 0,
    };
  }

  // Extract table headers
  const headerRegex = /<th[^>]*>([\s\S]*?)<\/th>/gi;
  const headers: string[] = [];
  let headerMatch;

  while ((headerMatch = headerRegex.exec(tableMatch[1])) !== null) {
    const headerText = headerMatch[1].replace(/<[^>]*>/g, "").trim();
    headers.push(headerText);
  }

  // Count rows (excluding header)
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const rows = [];
  let rowMatch;

  while ((rowMatch = rowRegex.exec(tableMatch[1])) !== null) {
    if (!rowMatch[1].includes("<th")) {
      rows.push(rowMatch[1]);
    }
  }

  const latestEntry = getLatestEntryFromTable(content);

  return {
    hasTable: true,
    latestVersion: latestEntry.version,
    latestReleaseDate: latestEntry.releaseDate,
    tableStructure: headers,
    rowCount: rows.length,
  };
}

/**
 * Test function specifically for page ID 4841177169
 */
export async function testPageAnalysis(
  settings: ExtensionSettings
): Promise<void> {
  try {
    console.log("Testing page analysis for Confluence page 4841177169...");

    // Analyze the specific page
    const analysis = await analyzeConfluencePage(settings, "4841177169");

    console.log("Page Analysis Results:");
    console.log("- Has table:", analysis.hasTable);
    console.log("- Latest version found:", analysis.latestVersion || "None");
    console.log("- Latest release date:", analysis.latestReleaseDate || "None");
    console.log("- Table headers:", analysis.tableStructure);
    console.log("- Row count (excluding header):", analysis.rowCount);

    // Test version extraction from sample PRs
    console.log("\nTesting version extraction from sample PR data...");

    const samplePRs: Partial<GitHubPullRequest>[] = [
      {
        title: "Release v1.2.3: Add new feature",
        body: "This PR adds a new feature\n\nChangelog: Added user authentication system",
        user: { login: "developer1" } as GitHubUser,
        number: 123,
        html_url: "https://github.com/test/repo/pull/123",
        merged_at: new Date().toISOString(),
      },
      {
        title: "Fix bug in payment processing",
        body: "Version 1.2.4\n\nChangelog: Fixed critical bug in payment flow\n\nArtifact link: https://releases.company.com/v1.2.4",
        user: { login: "developer2" } as GitHubUser,
        number: 124,
        html_url: "https://github.com/test/repo/pull/124",
        merged_at: new Date().toISOString(),
      },
    ];

    samplePRs.forEach((pr, index) => {
      const version = extractVersionFromPR(pr as GitHubPullRequest);
      const changelog = extractChangelogFromPR(pr as GitHubPullRequest);
      const prReleaseDate = pr.merged_at ? new Date(pr.merged_at) : new Date();

      console.log(`PR ${index + 1}:`);
      console.log("  - Version extracted:", version || "None");
      console.log("  - Changelog extracted:", changelog);
      console.log("  - PR release date:", prReleaseDate.toLocaleDateString());

      if (analysis.latestVersion) {
        const isNewer = isNewerVersion(version, analysis.latestVersion);
        console.log(
          `  - Is newer than latest version (${analysis.latestVersion}):`,
          isNewer
        );
      }

      // Test date-based filtering for PRs without version
      if (!version && analysis.latestReleaseDate) {
        const latestEntryDate = new Date(analysis.latestReleaseDate);
        const isNewerByDate = prReleaseDate > latestEntryDate;
        console.log(
          `  - Is newer by date than latest entry (${analysis.latestReleaseDate}):`,
          isNewerByDate
        );
      }
    });
  } catch (error) {
    console.error("Error testing page analysis:", error);
    throw error;
  }
}
