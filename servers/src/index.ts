#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import axios, { AxiosInstance } from "axios";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Validate environment variables
const JIRA_BASE_URL = process.env.JIRA_BASE_URL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
const JIRA_EMAIL = process.env.JIRA_EMAIL;

if (!JIRA_BASE_URL || !JIRA_API_TOKEN || !JIRA_EMAIL) {
  console.error("Missing required environment variables:");
  console.error("  - JIRA_BASE_URL: Your Jira instance URL (e.g., https://your-domain.atlassian.net)");
  console.error("  - JIRA_API_TOKEN: Your Jira API token");
  console.error("  - JIRA_EMAIL: Your Jira account email");
  console.error("\nSetup instructions:");
  console.error("1. Set these as environment variables or in a .env file");
  console.error("2. To get an API token, visit: https://id.atlassian.com/manage-profile/security/api-tokens");
  process.exit(1);
}

// Initialize MCP server
const server = new McpServer({
  name: "jira",
  version: "1.0.0",
});

// Create Jira API client
const jiraClient: AxiosInstance = axios.create({
  baseURL: `${JIRA_BASE_URL}/rest/api/3`,
  auth: {
    username: JIRA_EMAIL,
    password: JIRA_API_TOKEN,
  },
  headers: {
    "Accept": "application/json",
    "Content-Type": "application/json",
  },
});

// Type definitions
interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description: {
      content: Array<{
        content: Array<{
          text: string;
        }>;
      }>;
    } | null;
    status: {
      name: string;
    };
    assignee: {
      displayName: string;
      emailAddress: string;
    } | null;
    priority?: {
      name: string;
    };
    created: string;
    updated: string;
    labels?: string[];
    components?: Array<{
      name: string;
    }>;
  };
}

// Helper function to extract text from Jira description
function extractDescription(description: JiraIssue["fields"]["description"]): string {
  if (!description) return "No description";
  try {
    return description.content
      .map(block =>
        block.content
          .map(item => item.text)
          .join("")
      )
      .join("\n");
  } catch {
    return "Unable to parse description";
  }
}

// Register tools

// Tool 1: Get pending/open tasks
server.registerTool(
  "get_pending_tasks",
  {
    description: "Get all pending tasks (open issues) for the current user or a specific assignee",
    inputSchema: {
      assignee: z
        .string()
        .optional()
        .describe("Optional: assignee name or email. If not provided, returns tasks for current user"),
      projectKey: z
        .string()
        .optional()
        .describe("Optional: Jira project key (e.g., PROJ) to filter tasks"),
      limit: z
        .number()
        .optional()
        .default(10)
        .describe("Maximum number of issues to return (default: 10)"),
    },
  },
  async ({ assignee, projectKey, limit }) => {
    try {
      let jql = 'status != "Done" AND status != "Closed"';
      
      if (assignee) {
        jql += ` AND assignee ~ "${assignee}"`;
      } else {
        jql += ' AND assignee = currentUser()';
      }
      
      if (projectKey) {
        jql += ` AND project = "${projectKey}"`;
      }

      const response = await jiraClient.get("/search", {
        params: {
          jql,
          maxResults: Math.min(limit, 50),
          fields: ["summary", "status", "assignee", "priority", "created", "updated"],
        },
      });

      const issues = response.data.issues || [];
      
      if (issues.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No pending tasks found",
            },
          ],
        };
      }

      const taskList = issues
        .map((issue: JiraIssue) => {
          const assigneeName = issue.fields.assignee?.displayName || "Unassigned";
          const priority = issue.fields.priority?.name || "No priority";
          return `${issue.key}: ${issue.fields.summary} [${issue.fields.status.name}] (Priority: ${priority}, Assignee: ${assigneeName})`;
        })
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text: `Found ${issues.length} pending task(s):\n\n${taskList}`,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error fetching pending tasks: ${error.response?.data?.errorMessages?.[0] || error.message}`,
          },
        ],
      };
    }
  }
);

// Tool 2: Get task details
server.registerTool(
  "get_task_details",
  {
    description: "Get detailed information about a specific Jira task including full description",
    inputSchema: {
      issueKey: z
        .string()
        .describe("The Jira issue key (e.g., PROJ-123)"),
    },
  },
  async ({ issueKey }) => {
    try {
      const response = await jiraClient.get(`/issue/${issueKey}`, {
        params: {
          fields: [
            "summary",
            "description",
            "status",
            "assignee",
            "priority",
            "created",
            "updated",
            "labels",
            "components",
          ],
        },
      });

      const issue = response.data;
      const description = extractDescription(issue.fields.description);
      const labels = issue.fields.labels?.join(", ") || "None";
      const components = issue.fields.components?.map((c: any) => c.name).join(", ") || "None";
      const assigneeName = issue.fields.assignee?.displayName || "Unassigned";

      const details = `
Issue: ${issue.key}
Title: ${issue.fields.summary}
Status: ${issue.fields.status.name}
Priority: ${issue.fields.priority?.name || "No priority"}
Assignee: ${assigneeName}
Labels: ${labels}
Components: ${components}
Created: ${issue.fields.created}
Updated: ${issue.fields.updated}

Description:
${description}
`;

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
            text: `Error fetching task details: ${error.response?.data?.errorMessages?.[0] || error.message}`,
          },
        ],
      };
    }
  }
);

// Tool 3: Update task status
server.registerTool(
  "update_task_status",
  {
    description: "Update the status of a Jira task (e.g., change from In Progress to Done)",
    inputSchema: {
      issueKey: z
        .string()
        .describe("The Jira issue key (e.g., PROJ-123)"),
      status: z
        .string()
        .describe("New status (e.g., 'In Progress', 'Done', 'In Review')"),
    },
  },
  async ({ issueKey, status }) => {
    try {
      // First, get available transitions
      const transitionsResponse = await jiraClient.get(`/issue/${issueKey}/transitions`);
      const transitions = transitionsResponse.data.transitions || [];
      
      const transition = transitions.find((t: any) =>
        t.to.name.toLowerCase() === status.toLowerCase()
      );

      if (!transition) {
        const availableStatuses = transitions
          .map((t: any) => t.to.name)
          .join(", ");
        return {
          content: [
            {
              type: "text",
              text: `Status "${status}" not found. Available statuses: ${availableStatuses}`,
            },
          ],
        };
      }

      // Update the status
      await jiraClient.post(`/issue/${issueKey}/transitions`, {
        transition: {
          id: transition.id,
        },
      });

      return {
        content: [
          {
            type: "text",
            text: `Successfully updated ${issueKey} status to "${status}"`,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error updating task status: ${error.response?.data?.errorMessages?.[0] || error.message}`,
          },
        ],
      };
    }
  }
);

// Tool 4: Add comment to task
server.registerTool(
  "add_task_comment",
  {
    description: "Add a comment to a Jira task",
    inputSchema: {
      issueKey: z
        .string()
        .describe("The Jira issue key (e.g., PROJ-123)"),
      comment: z
        .string()
        .describe("The comment text to add"),
    },
  },
  async ({ issueKey, comment }) => {
    try {
      await jiraClient.post(`/issue/${issueKey}/comments`, {
        body: {
          content: [
            {
              content: [
                {
                  type: "text",
                  text: comment,
                },
              ],
              type: "paragraph",
            },
          ],
          type: "doc",
          version: 1,
        },
      });

      return {
        content: [
          {
            type: "text",
            text: `Successfully added comment to ${issueKey}`,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error adding comment: ${error.response?.data?.errorMessages?.[0] || error.message}`,
          },
        ],
      };
    }
  }
);

// Tool 5: Assign task
server.registerTool(
  "assign_task",
  {
    description: "Assign a task to a user",
    inputSchema: {
      issueKey: z
        .string()
        .describe("The Jira issue key (e.g., PROJ-123)"),
      assignee: z
        .string()
        .describe("Email or display name of the assignee"),
    },
  },
  async ({ issueKey, assignee }) => {
    try {
      await jiraClient.put(`/issue/${issueKey}`, {
        fields: {
          assignee: {
            name: assignee,
          },
        },
      });

      return {
        content: [
          {
            type: "text",
            text: `Successfully assigned ${issueKey} to ${assignee}`,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error assigning task: ${error.response?.data?.errorMessages?.[0] || error.message}`,
          },
        ],
      };
    }
  }
);

// Tool 6: Search tasks by JQL
server.registerTool(
  "search_tasks",
  {
    description: "Search for Jira tasks using JQL (Jira Query Language)",
    inputSchema: {
      jql: z
        .string()
        .describe("JQL query (e.g., 'project = PROJ AND status = \"To Do\"')"),
      limit: z
        .number()
        .optional()
        .default(10)
        .describe("Maximum number of issues to return"),
    },
  },
  async ({ jql, limit }) => {
    try {
      const response = await jiraClient.get("/search", {
        params: {
          jql,
          maxResults: Math.min(limit, 50),
          fields: ["summary", "status", "assignee", "priority"],
        },
      });

      const issues = response.data.issues || [];
      
      if (issues.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No tasks found matching the query",
            },
          ],
        };
      }

      const results = issues
        .map((issue: JiraIssue) => {
          const assigneeName = issue.fields.assignee?.displayName || "Unassigned";
          return `${issue.key}: ${issue.fields.summary} [${issue.fields.status.name}] (${assigneeName})`;
        })
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text: `Found ${issues.length} task(s):\n\n${results}`,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error searching tasks: ${error.response?.data?.errorMessages?.[0] || error.message}`,
          },
        ],
      };
    }
  }
);

// Main server function
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Jira MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
