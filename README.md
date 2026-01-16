# Custom MCP Servers

This repository hosts a collection of **Model Context Protocol (MCP)** servers tailored for custom needs. It currently includes a robust integration for GitLab, allowing AI assistants (like Claude, Cursor, or Copilot) to interact directly with your repositories.

## 🚀 Available Servers

### GitLab Server
A powerful MCP server for interacting with GitLab (both gitlab.com and on-premises instances).

#### Features
*   **`list_projects`**: List accessible projects with filtering options.
*   **`get_commits`**: Retrieve recent commits from a specific branch.
*   **`get_commit_details`**: Get comprehensive details and stats for a specific commit.
*   **`get_last_changes`**: Summarize activity and changes over a specified period.
*   **`list_branches`**: List all branches in a project.
*   **`list_merge_requests`**: View open, merged, or closed merge requests.

#### Prerequisites
*   Node.js & npm installed.
*   A GitLab Personal Access Token with `read_api` and `read_repository` scopes.

#### Configuration
The server requires the following environment variables:

| Variable | Description | Default |
| :--- | :--- | :--- |
| `GITLAB_API_TOKEN` | **Required.** Your GitLab personal access token. | - |
| `GITLAB_URL` | Optional. The base URL of your GitLab instance. | `https://gitlab.com` |

### Jira Server
An MCP server for interacting with Jira Cloud.

#### Features
*   **`get_pending_tasks`**: Get all pending tasks (open issues) for the current user or a specific assignee.
*   **`get_task_details`**: Get detailed information about a specific Jira task including full description.
*   **`update_task_status`**: Update the status of a Jira task.
*   **`add_task_comment`**: Add a comment to a Jira task.
*   **`assign_task`**: Assign a task to a user.
*   **`search_tasks`**: Search for Jira tasks using JQL.

#### Configuration
The server requires the following environment variables:

| Variable | Description | Default |
| :--- | :--- | :--- |
| `JIRA_BASE_URL` | **Required.** Your Jira instance URL (e.g., `https://your-domain.atlassian.net`). | - |
| `JIRA_API_TOKEN` | **Required.** Your Jira API token. | - |
| `JIRA_EMAIL` | **Required.** Your Jira account email. | - |

### SQL Server JSON
An MCP server that queries a SQL Server database to retrieve JSON data from a specific column.

#### Features
*   **`get_json_data`**: Query a specific table and column to retrieve JSON data based on dynamic filters.

#### Configuration
The server requires the following environment variables:

| Variable | Description | Default |
| :--- | :--- | :--- |
| `SQL_SERVER` | **Required.** Database server host. | - |
| `SQL_DATABASE` | **Required.** Database name. | - |
| `SQL_USER` | **Required.** Database user. | - |
| `SQL_PASSWORD` | **Required.** Database password. | - |
| `SQL_TABLE` | **Required.** The table to query. | - |
| `SQL_JSON_COLUMN` | **Required.** The column containing JSON data. | - |
| `SQL_PORT` | Optional. Database port. | `1433` |

## 🛠️ Usage with Visual Studio Code

To use these servers with the MCP extension in VS Code (e.g., with the Cursor AI or similar MCP-enabled tools), add the configuration to your VS Code user settings or the extension's `mcp.servers` config.

1.  **Build the servers locally**:
    ```bash
    npm install
    npm run build
    ```

2.  **Add to VS Code Configuration**:
    Open your MCP configuration file (typically found via the MCP extension settings or locally in your project if supported) and add the following entry:

    ```json
    {
      "mcpServers": {
        "gitlab": {
          "command": "node",
          "args": [
            "path/to/mcp-servers-custom/servers/build/gitlab.js"
          ],
          "env": {
            "GITLAB_API_TOKEN": "your-glpat-token-here",
            "GITLAB_URL": "https://gitlab.example.com"
          }
        },
        "jira": {
          "command": "node",
          "args": [
            "path/to/mcp-servers-custom/servers/build/index.js"
          ],
          "env": {
            "JIRA_BASE_URL": "https://your-domain.atlassian.net",
            "JIRA_API_TOKEN": "your-jira-api-token",
            "JIRA_EMAIL": "your-email@example.com"
          }
        },
        "sqlserver-json": {
          "command": "node",
          "args": [
            "path/to/mcp-servers-custom/servers/build/sqlserver-json.js"
          ],
          "env": {
            "SQL_SERVER": "localhost",
            "SQL_DATABASE": "MyDatabase",
            "SQL_USER": "sa",
            "SQL_PASSWORD": "yourStrong(!)Password",
            "SQL_TABLE": "MyTable",
            "SQL_JSON_COLUMN": "JsonDataColumn"
          }
        }
      }
    }
    ```
    > **Note:** Replace `path/to/mcp-servers-custom` with the absolute path to this repository on your machine.

## 📦 Adding New Servers

This repository is structured to easily support multiple servers.

1.  Create a new server file in `servers/src/` (e.g., `myserver.ts`).
2.  Implement your MCP tools and resources.
3.  Add the new entry point to the `bin` section in `servers/package.json` and `package.json` if needed.
4.  Build the project using `npm run build`.

## 📄 License
ISC
