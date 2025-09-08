import type {
  GitHubPullRequest,
  GitHubUser,
  ConfluencePage,
  ConfluenceUpdatePage,
  ExtensionSettings,
} from "@/types";
import { parse, isValid, compareDesc } from "date-fns";
import { compare, coerce } from "semver";

/**
 * Fetch merged pull requests from GitHub repository that were merged into the specified branch
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

  // Filter for merged PRs only that were merged into the specified branch
  let mergedPRs = pullRequests.filter((pr) => {
    // Check if PR is merged and if it was merged into the specified branch
    return pr.merged_at && pr.base.ref === settings.branchName;
  });

  console.log(
    `Found ${pullRequests.length} closed PRs, ${mergedPRs.length} merged into branch '${settings.branchName}'`
  );

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
 * Extract version from package.json file at the specific commit SHA and fetch complete PR details
 * This function fetches both the package.json file and the complete PR details (including merged_by)
 * to minimize network calls. Returns both the version and the updated PR object.
 */
async function extractVersionAndPRDetails(
  pr: GitHubPullRequest,
  settings: ExtensionSettings
): Promise<{ version: string; detailedPR: GitHubPullRequest }> {
  let detailedPR = pr;

  // First, fetch complete PR details to get merged_by information
  try {
    const owner = settings.repoOwner;
    const repo = settings.repoName;
    const detailUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${pr.number}`;

    const detailResponse = await fetch(detailUrl, {
      headers: {
        Authorization: `token ${settings.githubToken}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "GitHub-Confluence-Extension",
      },
    });

    if (detailResponse.ok) {
      detailedPR = await detailResponse.json();
    } else {
      console.warn(
        `Failed to fetch details for PR #${pr.number}, using list data`
      );
    }
  } catch (error) {
    console.warn(`Error fetching details for PR #${pr.number}:`, error);
  }

  // Now extract version from package.json using the detailed PR data
  try {
    const owner = settings.repoOwner;
    const repo = settings.repoName;
    const sha = detailedPR.merge_commit_sha || detailedPR.head.sha;

    if (!sha) {
      console.log(
        `No commit SHA available for PR #${pr.number}, falling back to title/body`
      );
      return { version: extractVersionFromPRText(detailedPR), detailedPR };
    }

    // Fetch package.json content from the specific commit
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/package.json?ref=${sha}`;

    console.log(`Fetching package.json for PR #${pr.number} from ${url}`);

    const response = await fetch(url, {
      headers: {
        Authorization: `token ${settings.githubToken}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "GitHub-Confluence-Extension",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.log(
          `package.json not found for PR #${pr.number} at commit ${sha}, falling back to title/body`
        );
        return { version: extractVersionFromPRText(detailedPR), detailedPR };
      }
      throw new Error(
        `GitHub API error: ${response.status} ${response.statusText}`
      );
    }

    const fileData = await response.json();

    // Decode base64 content
    if (!fileData.content) {
      console.log(
        `No content field in package.json response for PR #${pr.number}`
      );
      return { version: extractVersionFromPRText(detailedPR), detailedPR };
    }

    let content;
    try {
      content = atob(fileData.content.replace(/\s/g, "")); // Remove whitespace from base64
    } catch (decodeError) {
      console.log(
        `Failed to decode base64 content for PR #${pr.number}:`,
        decodeError
      );
      return { version: extractVersionFromPRText(detailedPR), detailedPR };
    }

    let packageJson;
    try {
      packageJson = JSON.parse(content);
    } catch (parseError) {
      console.log(
        `Failed to parse package.json content for PR #${pr.number}:`,
        parseError
      );
      return { version: extractVersionFromPRText(detailedPR), detailedPR };
    }

    if (packageJson.version) {
      console.log(
        `Extracted version ${packageJson.version} from package.json for PR #${pr.number}`
      );
      return { version: packageJson.version, detailedPR };
    } else {
      console.log(
        `No version field in package.json for PR #${pr.number}, falling back to title/body`
      );
      return { version: extractVersionFromPRText(detailedPR), detailedPR };
    }
  } catch (error) {
    console.log(
      `Error extracting version from package.json for PR #${pr.number}:`,
      error
    );
    return { version: extractVersionFromPRText(detailedPR), detailedPR };
  }
}

/**
 * Extract version from PR title or body (fallback method)
 */
function extractVersionFromPRText(pr: GitHubPullRequest): string {
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
 * Extract version from PR by checking package.json first, then falling back to title/body
 * Also returns the detailed PR object with merged_by information
 */
async function extractVersionFromPR(
  pr: GitHubPullRequest,
  settings: ExtensionSettings
): Promise<string> {
  const result = await extractVersionAndPRDetails(pr, settings);
  return result.version;
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
 * Parse date string in various formats commonly used in tables using date-fns
 */
function parseTableDate(dateString: string): Date | null {
  if (!dateString) return null;

  const cleanDate = dateString.trim();

  // Common date formats to try
  const dateFormats = [
    "dd/MM/yyyy", // European format: 30/08/2025
    "MM/dd/yyyy", // US format: 08/30/2025
    "dd-MM-yyyy", // European dash format: 30-08-2025
    "MM-dd-yyyy", // US dash format: 08-30-2025
    "yyyy-MM-dd", // ISO format: 2025-08-30
    "dd/MM/yy", // Short year: 30/08/25
    "MM/dd/yy", // US short year: 08/30/25
  ];

  // Try each format until one works
  for (const dateFormat of dateFormats) {
    try {
      const parsedDate = parse(cleanDate, dateFormat, new Date());
      if (isValid(parsedDate)) {
        return parsedDate;
      }
    } catch (error) {
      // Continue to next format
    }
  }

  // Fallback to native Date parsing
  try {
    const fallbackDate = new Date(cleanDate);
    if (isValid(fallbackDate)) {
      return fallbackDate;
    }
  } catch (error) {
    // Ignore error
  }

  return null;
}

/**
 * Compare two version strings semantically using semver
 * Returns: negative if version1 < version2, positive if version1 > version2, 0 if equal
 */
function compareVersions(version1: string, version2: string): number {
  if (!version1 && !version2) return 0;
  if (!version1) return -1;
  if (!version2) return 1;

  // Try to coerce versions to valid semver format
  const v1 = coerce(version1);
  const v2 = coerce(version2);

  // If both versions can be coerced, use semver comparison
  if (v1 && v2) {
    return compare(v1, v2);
  }

  // Fallback to string-based comparison for non-semver versions
  const parts1 = version1.split(".").map((part) => {
    const num = parseInt(part);
    return isNaN(num) ? 0 : num;
  });
  const parts2 = version2.split(".").map((part) => {
    const num = parseInt(part);
    return isNaN(num) ? 0 : num;
  });

  const maxLength = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < maxLength; i++) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;

    if (part1 > part2) return 1;
    if (part1 < part2) return -1;
  }

  return 0;
}

/**
 * Extract clean version text from Confluence formatted content
 */
function extractVersionFromCell(cellContent: string): string {
  // Handle h4 tags: <h4>2.3.1</h4>
  const h4Match = cellContent.match(/<h4[^>]*>(.*?)<\/h4>/i);
  if (h4Match) {
    return h4Match[1].trim();
  }

  // Fallback: remove all HTML tags
  return cellContent.replace(/<[^>]*>/g, "").trim();
}

/**
 * Extract clean date text from Confluence formatted content
 */
function extractDateFromCell(cellContent: string): string {
  // Handle time elements: <time datetime="2025-09-07" />
  const timeMatch = cellContent.match(/<time\s+datetime="([^"]+)"\s*\/?>/i);
  if (timeMatch) {
    // Convert ISO date to DD/MM/YYYY format for parseTableDate
    const isoDate = timeMatch[1];
    const date = new Date(isoDate);
    if (!isNaN(date.getTime())) {
      return `${date.getDate().toString().padStart(2, "0")}/${(
        date.getMonth() + 1
      )
        .toString()
        .padStart(2, "0")}/${date.getFullYear()}`;
    }
  }

  // Handle other date formats or fallback
  return cellContent.replace(/<[^>]*>/g, "").trim();
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
      // Get raw cell content first
      const rawCellContent = cellMatch[1];
      cells.push(rawCellContent);
    }

    // Based on table structure: Type, Version, PR, Developer, Change Log, Status, Release Date, Artifact Link
    // Version is in index 1, PR is in index 2, Release Date is in index 6
    if (cells.length > 6 && cells[1] && cells[6]) {
      // Extract version using specialized parser
      const version = extractVersionFromCell(cells[1]);

      // Extract date using specialized parser
      const rawReleaseDateContent = cells[6];
      const releaseDate = extractDateFromCell(rawReleaseDateContent);

      // Extract PR number from PR cell (remove HTML tags for this)
      const prCell = cells[2].replace(/<[^>]*>/g, "").trim(); // Contains PR link like "#123"

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
    // Use date-fns compareDesc for date comparison (desc = most recent first)
    const dateComparison = compareDesc(a.rawDate, b.rawDate);
    if (dateComparison !== 0) return dateComparison;

    // If dates are the same, compare versions using semver
    return compareVersions(b.version, a.version); // Descending order (newer first)
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
  return compareVersions(version1, version2) > 0;
}

/**
 * Format PR data for the new Confluence table structure
 */
export async function formatPRForConfluence(
  pr: GitHubPullRequest,
  settings: ExtensionSettings,
  version?: string
): Promise<string> {
  const prVersion = version ?? (await extractVersionFromPR(pr, settings));
  const changelog = extractChangelogFromPR(pr);
  const mergedDate = pr.merged_at ? new Date(pr.merged_at) : new Date();

  // Format version as h4 heading in Confluence
  const formattedVersion = prVersion ? `<h4>${prVersion}</h4>` : "";

  // Format date using Confluence date macro (YYYY-MM-DD format)
  const formattedDate = `<time datetime="${
    mergedDate.toISOString().split("T")[0]
  }" />`;

  // Format status as orange status pill in Confluence
  const statusPill = `<ac:structured-macro ac:name="status" ac:schema-version="1">
    <ac:parameter ac:name="colour">Orange</ac:parameter>
    <ac:parameter ac:name="title">Published</ac:parameter>
  </ac:structured-macro>`;

  // Show both PR author and person who merged it
  let developer: string;
  if (pr.merged_by?.login && pr.merged_by.login !== pr.user.login) {
    // Different people: show both author and merger
    developer = `${pr.user.login} (developer) / ${pr.merged_by.login} (QA/merged by)`;
  } else if (pr.merged_by?.login) {
    // Same person: show just the name with role
    developer = `${pr.user.login} (developer & merged)`;
  } else {
    // No merger info: show just author
    developer = `${pr.user.login} (developer)`;
  }

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
  <td>${formattedVersion}</td>
  <td>${prLink}</td>
  <td>${developer}</td>
  <td>${changelog}</td>
  <td>${statusPill}</td>
  <td>${formattedDate}</td>
  <td>${artifactLink}</td>
</tr>`;
}

/**
 * Append PRs to existing Confluence page content
 */
export async function appendPRsToContent(
  existingContent: string,
  prs: GitHubPullRequest[],
  settings: ExtensionSettings
): Promise<string> {
  if (prs.length === 0) return existingContent;

  // Get the latest version and release date from the existing table
  const latestEntry = getLatestEntryFromTable(existingContent);

  // First pass: Filter PRs by date and existing PR numbers to avoid unnecessary version extraction
  const potentialNewPRs = prs.filter((pr) => {
    const prReleaseDate = pr.merged_at ? new Date(pr.merged_at) : new Date();

    // Check if PR is already in the table by PR number
    const isPRAlreadyInTable = latestEntry.entries.some((entry) => {
      return entry.prNumber === pr.number;
    });

    if (isPRAlreadyInTable) {
      return false; // Skip PRs that are already in the table
    }

    // If no entries in table yet, include all PRs for version checking
    if (!latestEntry.releaseDate) {
      return true;
    }

    // Only include PRs with release date newer than latest entry
    const latestEntryDate = new Date(latestEntry.releaseDate);
    return prReleaseDate > latestEntryDate;
  });

  if (potentialNewPRs.length === 0) return existingContent;

  console.log(
    `Filtering ${potentialNewPRs.length} potential new PRs by version...`
  );

  // Second pass: Extract versions only for filtered PRs and apply version-based filtering
  // Also get detailed PR information (including merged_by) in the same call
  const newPRsWithDetails: { pr: GitHubPullRequest; version: string }[] = [];
  for (const pr of potentialNewPRs) {
    const { version: prVersion, detailedPR } = await extractVersionAndPRDetails(
      pr,
      settings
    );

    // If PR has version, check if it's newer than latest table version
    if (prVersion) {
      // If table has no versions, include it
      if (!latestEntry.version) {
        newPRsWithDetails.push({ pr: detailedPR, version: prVersion });
        continue;
      }

      // Only include if PR version is newer
      if (isNewerVersion(prVersion, latestEntry.version)) {
        newPRsWithDetails.push({ pr: detailedPR, version: prVersion });
        continue;
      } else {
        console.log(
          `Skipping PR #${pr.number} - version ${prVersion} is not newer than ${latestEntry.version}`
        );
      }
    } else {
      // If PR has no version but passed date filter, include it
      newPRsWithDetails.push({ pr: detailedPR, version: prVersion });
    }
  }

  if (newPRsWithDetails.length === 0) {
    console.log("No new PRs to add after version filtering");
    return existingContent;
  }

  console.log(`Adding ${newPRsWithDetails.length} new PRs to Confluence table`);

  // Check if changelog table exists
  const tableRegex = /<table[^>]*>[\s\S]*?<\/table>/i;
  const tableMatch = existingContent.match(tableRegex);

  if (tableMatch) {
    // Table exists, append new rows before closing </table>
    const prRowPromises = newPRsWithDetails.map(({ pr, version }) =>
      formatPRForConfluence(pr, settings, version)
    );
    const prRows = (await Promise.all(prRowPromises)).join("\n");
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

    const prRowPromises = newPRsWithDetails.map(({ pr, version }) =>
      formatPRForConfluence(pr, settings, version)
    );
    const prRows = (await Promise.all(prRowPromises)).join("\n");
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

    // Test date parsing with sample dates
    console.log("\nTesting date parsing...");
    const testDates = ["30/08/2025", "23/08/2025", "07/09/2025", "03/09/2025"];
    testDates.forEach((dateStr) => {
      const parsed = parseTableDate(dateStr);
      console.log(
        `Date "${dateStr}" parsed to:`,
        parsed?.toISOString(),
        `(${parsed?.toLocaleDateString()})`
      );
    });

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

    for (let index = 0; index < samplePRs.length; index++) {
      const pr = samplePRs[index];
      const version = await extractVersionFromPR(
        pr as GitHubPullRequest,
        settings
      );
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
    }
  } catch (error) {
    console.error("Error testing page analysis:", error);
    throw error;
  }
}
