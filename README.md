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
