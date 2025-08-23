// GitHub API Types
export interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  html_url: string;
}

export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  state: "open" | "closed";
  merged: boolean;
  merged_at: string | null;
  merge_commit_sha: string | null;
  user: GitHubUser;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  base: {
    ref: string;
    sha: string;
  };
  head: {
    ref: string;
    sha: string;
  };
}

// Confluence API Types
export interface ConfluencePageContent {
  value: string;
  representation: string;
}

export interface ConfluencePageBody {
  storage: ConfluencePageContent;
}

export interface ConfluencePageVersion {
  number: number;
  when: string;
  by: {
    type: string;
    username: string;
    userKey: string;
    displayName: string;
  };
}

export interface ConfluencePage {
  id: string;
  type: string;
  status: string;
  title: string;
  body: ConfluencePageBody;
  version: ConfluencePageVersion;
  _links: {
    webui: string;
    edit: string;
    tinyui: string;
    self: string;
  };
}

export interface ConfluenceUpdatePage {
  id: string;
  type: string;
  title: string;
  body: {
    storage: {
      value: string;
      representation: string;
    };
  };
  version: {
    number: number;
  };
}

// Extension Settings Types
export interface ExtensionSettings {
  githubToken: string;
  repoOwner: string;
  repoName: string;
  confluenceUrl: string;
  confluenceEmail: string;
  confluenceToken: string;
  pageId: string;
  lastCheckedTimestamp?: string;
}

// Chrome Extension Message Types
export interface ExtensionMessage {
  action: "CHECK_PRS" | "SETTINGS_UPDATED" | "testConnections";
  data?: any;
  settings?: ExtensionSettings;
}

export interface ExtensionResponse {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
}
