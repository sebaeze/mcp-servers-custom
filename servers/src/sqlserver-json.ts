import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import sql from "mssql";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

const SQL_SERVER = process.env.SQL_SERVER;
const SQL_DATABASE = process.env.SQL_DATABASE;
const SQL_USER = process.env.SQL_USER;
const SQL_PASSWORD = process.env.SQL_PASSWORD;
const SQL_PORT = parseInt(process.env.SQL_PORT || "1433", 10);
const SQL_TABLE = process.env.SQL_TABLE;
const SQL_JSON_COLUMN = process.env.SQL_JSON_COLUMN;

if (!SQL_SERVER || !SQL_DATABASE || !SQL_USER || !SQL_PASSWORD || !SQL_TABLE || !SQL_JSON_COLUMN) {
    console.error("Missing required environment variables:");
    if (!SQL_SERVER) console.error("  - SQL_SERVER");
    if (!SQL_DATABASE) console.error("  - SQL_DATABASE");
    if (!SQL_USER) console.error("  - SQL_USER");
    if (!SQL_PASSWORD) console.error("  - SQL_PASSWORD");
    if (!SQL_TABLE) console.error("  - SQL_TABLE");
    if (!SQL_JSON_COLUMN) console.error("  - SQL_JSON_COLUMN");
    process.exit(1);
}

const config: sql.config = {
    user: SQL_USER,
    password: SQL_PASSWORD,
    server: SQL_SERVER,
    database: SQL_DATABASE,
    port: SQL_PORT,
    options: {
        encrypt: true, // Use this if you're on Azure or require it
        trustServerCertificate: true, // Change to false for production
    },
};

// Initialize MCP server
const server = new McpServer({
    name: "sqlserver-json",
    version: "1.0.0",
});

// Create a connection pool
const poolPromise = new sql.ConnectionPool(config)
    .connect()
    .then((pool) => {
        console.error("Connected to SQL Server");
        return pool;
    })
    .catch((err) => {
        console.error("Database Connection Failed! Bad Config: ", err);
        process.exit(1);
    });

server.registerTool(
    "get_json_data",
    {
        description: `Query the table '${SQL_TABLE}' to retrieve JSON data from column '${SQL_JSON_COLUMN}' based on filters.`,
        inputSchema: {
            filters: z
                .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
                .describe("Key-value pairs to filter by (e.g., { id: 123, status: 'active' })"),
            top: z
                .number()
                .optional()
                .default(10)
                .describe("Maximum number of rows to retrieve (default: 10)"),
        },
    },
    async ({ filters, top }) => {
        try {
            const pool = await poolPromise;
            const request = pool.request();

            // Build the WHERE clause dynamically
            const conditions: string[] = [];
            Object.entries(filters).forEach(([key, value], index) => {
                // Sanitize key to prevent obvious injection (simple alphanumeric check)
                if (!/^[a-zA-Z0-9_]+$/.test(key)) {
                    throw new Error(`Invalid column name: ${key}`);
                }
                const paramName = `param${index}`;
                request.input(paramName, value);
                conditions.push(`${key} = @${paramName}`);
            });

            const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
            const query = `SELECT TOP ${top} ${SQL_JSON_COLUMN} as jsonData FROM ${SQL_TABLE} ${whereClause}`;

            const result = await request.query(query);

            if (result.recordset.length === 0) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "No data found matching the criteria.",
                        },
                    ],
                };
            }

            // Collect the JSON data
            const jsonResults = result.recordset.map((row) => row.jsonData);

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(jsonResults, null, 2),
                    },
                ],
            };
        } catch (error: any) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Error querying database: ${error.message}`,
                    },
                ],
                isError: true,
            };
        }
    }
);

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("SQL Server JSON MCP Server running on stdio");
}

main().catch(console.error);
