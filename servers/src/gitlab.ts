import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import axios, { AxiosInstance } from "axios";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Validate environment variables
const GITLAB_URL = process.env.GITLAB_URL || "https://gitlab.com";
const GITLAB_API_TOKEN = process.env.GITLAB_API_TOKEN;

if (!GITLAB_API_TOKEN) {
  console.error("Missing required environment variables:");
  console.error("  - GITLAB_API_TOKEN: Your GitLab personal access token");
  console.error("  - GITLAB_URL: (optional) Your GitLab instance URL (default: https://gitlab.com)");
  console.error("\nSetup instructions:");
  console.error("1. Visit: https://gitlab.com/-/user_settings/personal_access_tokens");
  console.error("2. Create a token with 'read_api' and 'read_repository' scopes");
  console.error("3. Set GITLAB_API_TOKEN as an environment variable");
  process.exit(1);
}

// Initialize MCP server
const server = new McpServer({
  name: "gitlab",
  version: "1.0.0",
});

// Create GitLab API client
const gitlabClient: AxiosInstance = axios.create({
  baseURL: `${GITLAB_URL}/api/v4`,
  headers: {
    "PRIVATE-TOKEN": GITLAB_API_TOKEN,
    "Content-Type": "application/json",
  },
});

// Type definitions
interface GitLabCommit {
  id: string;
  short_id: string;
  title: string;
  message: string;
  author_name: string;
  author_email: string;
  authored_date: string;
  created_at: string;
  parent_ids: string[];
  web_url: string;
}

interface GitLabProject {
  id: number;
  name: string;
  path: string;
  path_with_namespace: string;
  web_url: string;
}

interface GitLabBranch {
  name: string;
  commit: {
    id: string;
    short_id: string;
    title: string;
    message: string;
  };
  merged: boolean;
}


// Helper: Resolve project ID from name or path
async function resolveProjectId(projectIdentifier: string | number): Promise<string | number> {
  const encodedId = encodeURIComponent(String(projectIdentifier));
  try {
    // Try accessing directly (works for ID or full path)
    await gitlabClient.get(`/projects/${encodedId}`);
    return projectIdentifier;
  } catch (error: any) {
    // If not found (404), try searching by name
    if (error.response?.status === 404 && typeof projectIdentifier === 'string') {
      const searchResponse = await gitlabClient.get('/projects', {
        params: {
          search: projectIdentifier,
          per_page: 1
        }
      });
      if (searchResponse.data.length > 0) {
        return searchResponse.data[0].id;
      }
    }
    // If still not found or other error, throw original or new error
    throw error;
  }
}

// Register tools

// Tool 1: List user's projects
server.registerTool(
  "list_projects",
  {
    description: "List all GitLab projects accessible to the authenticated user",
    inputSchema: {
      archived: z
        .boolean()
        .optional()
        .describe("Filter archived projects"),
      search: z
        .string()
        .optional()
        .describe("Search projects by name"),
      limit: z
        .number()
        .optional()
        .default(20)
        .describe("Maximum number of projects to return (default: 20, max: 100)"),
    },
  },
  async ({ archived, search, limit }) => {
    try {
      const params: any = {
        per_page: Math.min(limit, 100),
        order_by: "updated_at",
        sort: "desc",
      };

      if (archived !== undefined) {
        params.archived = archived;
      }

      if (search) {
        params.search = search;
      }

      const response = await gitlabClient.get("/projects", { params });
      const projects: GitLabProject[] = response.data;

      if (projects.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No projects found",
            },
          ],
        };
      }

      const projectsList = projects
        .map(
          (p) =>
            `• **${p.name}** (${p.path_with_namespace})\n  ID: ${p.id}\n  URL: ${p.web_url}`
        )
        .join("\n\n");

      return {
        content: [
          {
            type: "text",
            text: `Found ${projects.length} project(s):\n\n${projectsList}`,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error listing projects: ${error.response?.data?.message || error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool 2: Get recent commits from a project
server.registerTool(
  "get_commits",
  {
    description: "Get recent commits from a GitLab project",
    inputSchema: {
      projectId: z
        .union([z.string(), z.number()])
        .describe("GitLab project ID or path (e.g., 'group/project')"),
      branch: z
        .string()
        .optional()
        .default("main")
        .describe("Branch name (default: main)"),
      limit: z
        .number()
        .optional()
        .default(10)
        .describe("Maximum number of commits to return (default: 10)"),
      author: z
        .string()
        .optional()
        .describe("Filter commits by author name or email"),
      since: z
        .string()
        .optional()
        .describe("Return commits after this date (ISO 8601 format: YYYY-MM-DD)"),
    },
  },
  async ({ projectId, branch, limit, author, since }) => {
    try {
      const resolvedIds = await resolveProjectId(projectId);
      const encodedProjectId = encodeURIComponent(String(resolvedIds));
      const params: any = {
        ref_name: branch,
        per_page: Math.min(limit, 100),
      };

      if (author) {
        params.author = author;
      }

      if (since) {
        params.since = since;
      }

      const response = await gitlabClient.get(
        `/projects/${encodedProjectId}/repository/commits`,
        { params }
      );

      const commits: GitLabCommit[] = response.data;

      if (commits.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No commits found on branch '${branch}'`,
            },
          ],
        };
      }

      const commitsList = commits
        .map((commit) => {
          const date = new Date(commit.authored_date).toLocaleString();
          return `• **${commit.short_id}** - ${commit.title}\n  Author: ${commit.author_name} <${commit.author_email}>\n  Date: ${date}\n  Message: ${commit.message.split("\n")[0]}\n  URL: ${commit.web_url}`;
        })
        .join("\n\n");

      return {
        content: [
          {
            type: "text",
            text: `Found ${commits.length} commit(s) on branch '${branch}':\n\n${commitsList}`,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error fetching commits: ${error.response?.data?.message || error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool 3: Get commit details
server.registerTool(
  "get_commit_details",
  {
    description: "Get detailed information about a specific commit including changes",
    inputSchema: {
      projectId: z
        .union([z.string(), z.number()])
        .describe("GitLab project ID or path"),
      commitSha: z
        .string()
        .describe("Full or short commit SHA"),
    },
  },
  async ({ projectId, commitSha }) => {
    try {
      const resolvedId = await resolveProjectId(projectId);
      const encodedProjectId = encodeURIComponent(String(resolvedId));

      const response = await gitlabClient.get(
        `/projects/${encodedProjectId}/repository/commits/${commitSha}`,
        {
          params: {
            stats: true,
          },
        }
      );

      const commit: any = response.data;

      const details = `
**Commit:** ${commit.id}
**Author:** ${commit.author_name} <${commit.author_email}>
**Date:** ${new Date(commit.authored_date).toLocaleString()}
**Title:** ${commit.title}

**Message:**
\`\`\`
${commit.message}
\`\`\`

**Statistics:**
- Files Changed: ${commit.stats?.files_changed || 0}
- Additions: ${commit.stats?.additions || 0}
- Deletions: ${commit.stats?.deletions || 0}

**Parent Commits:** ${commit.parent_ids?.join(", ") || "None"}
**Web URL:** ${commit.web_url}
      `.trim();

      return {
        content: [
          {
            type: "text",
            text: details,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error fetching commit details: ${error.response?.data?.message || error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool 4: Get last changes (summary of recent activity)
server.registerTool(
  "get_last_changes",
  {
    description: "Get a summary of the last changes across recent commits",
    inputSchema: {
      projectId: z
        .union([z.string(), z.number()])
        .describe("GitLab project ID or path"),
      branch: z
        .string()
        .optional()
        .default("main")
        .describe("Branch name (default: main)"),
      days: z
        .number()
        .optional()
        .default(7)
        .describe("Number of days to look back (default: 7)"),
    },
  },
  async ({ projectId, branch, days }) => {
    try {
      const resolvedId = await resolveProjectId(projectId);
      const encodedProjectId = encodeURIComponent(String(resolvedId));
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - days);
      const sinceISO = sinceDate.toISOString().split("T")[0];

      const response = await gitlabClient.get(
        `/projects/${encodedProjectId}/repository/commits`,
        {
          params: {
            ref_name: branch,
            since: sinceISO,
            per_page: 100,
          },
        }
      );

      const commits: GitLabCommit[] = response.data;

      if (commits.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No commits found in the last ${days} days on branch '${branch}'`,
            },
          ],
        };
      }

      // Aggregate statistics
      const uniqueAuthors = new Set(commits.map((c) => c.author_name));
      const commitsByDate: Record<string, number> = {};
      let totalAdditions = 0;
      let totalDeletions = 0;

      commits.forEach((commit) => {
        const date = new Date(commit.authored_date).toLocaleDateString();
        commitsByDate[date] = (commitsByDate[date] || 0) + 1;
      });

      // Get detailed stats for recent commits
      const recentCommits = commits.slice(0, 5);
      for (const commit of recentCommits) {
        try {
          const detailResponse = await gitlabClient.get(
            `/projects/${encodedProjectId}/repository/commits/${commit.id}`,
            { params: { stats: true } }
          );
          totalAdditions += detailResponse.data.stats?.additions || 0;
          totalDeletions += detailResponse.data.stats?.deletions || 0;
        } catch {
          // Skip if unable to get stats
        }
      }

      const summary = `
**Last ${days} Days Summary - Branch: ${branch}**

**Activity:**
- Total Commits: ${commits.length}
- Unique Authors: ${uniqueAuthors.size}
- Authors: ${Array.from(uniqueAuthors).join(", ")}

**Timeline:**
${Object.entries(commitsByDate)
          .reverse()
          .map(([date, count]) => `- ${date}: ${count} commit(s)`)
          .join("\n")}

**Recent Changes (last 5 commits):**
${recentCommits
          .map((c) => `- ${c.short_id} | ${c.author_name}: ${c.title}`)
          .join("\n")}

**Code Changes (sample from recent commits):**
- Additions: ~${totalAdditions}
- Deletions: ~${totalDeletions}
      `.trim();

      return {
        content: [
          {
            type: "text",
            text: summary,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error fetching changes: ${error.response?.data?.message || error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool 5: Get branches
server.registerTool(
  "list_branches",
  {
    description: "List all branches in a GitLab project",
    inputSchema: {
      projectId: z
        .union([z.string(), z.number()])
        .describe("GitLab project ID or path"),
      limit: z
        .number()
        .optional()
        .default(20)
        .describe("Maximum number of branches to return (default: 20)"),
    },
  },
  async ({ projectId, limit = 20 }: { projectId: string | number, limit: number }) => {
    try {
      const resolvedId = await resolveProjectId(projectId);
      const encodedProjectId = encodeURIComponent(String(resolvedId));

      const response = await gitlabClient.get(
        `/projects/${encodedProjectId}/repository/branches`,
        {
          params: {
            per_page: Math.min(limit, 100),
          },
        }
      );

      const branches: GitLabBranch[] = response.data;

      if (branches.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No branches found",
            },
          ],
        };
      }

      const branchList = branches
        .map(
          (b) =>
            `• **${b.name}**${b.merged ? " (merged)" : ""}\n  Latest: ${b.commit.short_id} - ${b.commit.title}`
        )
        .join("\n\n");

      return {
        content: [
          {
            type: "text",
            text: `Found ${branches.length} branch(es):\n\n${branchList}`,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error listing branches: ${error.response?.data?.message || error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);


interface GitLabMergeRequest {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  description: string;
  state: string;
  created_at: string;
  updated_at: string;
  web_url: string;
  author: {
    name: string;
    username: string;
  };
  assignee: {
    name: string;
    username: string;
  } | null;
  source_branch: string;
  target_branch: string;
}

// Tool 6: List merge requests
server.registerTool(
  "list_merge_requests",
  {
    description: "List merge requests for a project or globally for the authenticated user",
    inputSchema: {
      projectId: z
        .union([z.string(), z.number()])
        .optional()
        .describe("GitLab project ID or path (optional, omit for global list)"),
      state: z
        .enum(["opened", "closed", "merged", "all"])
        .optional()
        .default("opened")
        .describe("Filter by state (default: opened)"),
      limit: z
        .number()
        .optional()
        .default(20)
        .describe("Maximum number of merge requests to return (default: 20)"),
    },
  },
  async ({ projectId, state = "opened", limit = 20 }: { projectId?: string | number, state?: string, limit?: number }) => {
    try {
      const params: any = {
        state,
        per_page: Math.min(limit, 100),
        order_by: "created_at",
        sort: "desc",
        scope: "all" // For global requests to see all MRs user has access to
      };

      let url = "/merge_requests";

      if (projectId) {
        const resolvedId = await resolveProjectId(projectId);
        const encodedProjectId = encodeURIComponent(String(resolvedId));
        url = `/projects/${encodedProjectId}/merge_requests`;
        delete params.scope; // scope param not needed/valid for project-level endpoint in same way
      }

      const response = await gitlabClient.get(url, { params });
      const mrs: GitLabMergeRequest[] = response.data;

      if (mrs.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No ${state} merge requests found${projectId ? ` for project ${projectId}` : ""}`,
            },
          ],
        };
      }

      const mrList = mrs
        .map((mr) => {
          const author = mr.author ? `${mr.author.name} (@${mr.author.username})` : "Unknown";
          const assignee = mr.assignee ? `\n  Assignee: ${mr.assignee.name} (@${mr.assignee.username})` : "";
          return `• **!${mr.iid}** - ${mr.title} (${mr.state})\n  Project ID: ${mr.project_id}\n  Author: ${author}${assignee}\n  Branch: ${mr.source_branch} -> ${mr.target_branch}\n  Created: ${new Date(mr.created_at).toLocaleString()}\n  URL: ${mr.web_url}`;
        })
        .join("\n\n");

      return {
        content: [
          {
            type: "text",
            text: `Found ${mrs.length} merge request(s):\n\n${mrList}`,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error listing merge requests: ${error.response?.data?.message || error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("GitLab MCP Server running on stdio");
}

main().catch(console.error);
