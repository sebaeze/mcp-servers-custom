import fs from 'fs';
import path from 'path';

// Configuration
const IGNORED_DIRS = new Set(['.git', 'node_modules', 'build', 'dist', 'coverage', '.vscode', '.gemini']);
const IGNORED_FILES = new Set(['package-lock.json', 'yarn.lock', '.DS_Store', '.env', '.env.local', '.env.test', '.env.production']);
const SECRET_PATTERNS = [
    { name: 'GitLab Token', regex: /glpat-[0-9a-zA-Z\-\_]{20,}/ },
    { name: 'GitHub Token', regex: /ghp_[0-9a-zA-Z]{36}/ },
    { name: 'Private Key', regex: new RegExp('-----BEGIN ' + 'PRIVATE KEY-----') },
    { name: 'RSA Key', regex: new RegExp('-----BEGIN RSA ' + 'PRIVATE KEY-----') },
    { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/ },
    { name: 'Generic API Key', regex: /(api_key|apikey|secret|token|password|auth)[\s]*[:=][\s]*["'][a-zA-Z0-9\-\_]{16,}["']/i },
    { name: 'Hardcoded Password', regex: /password[\s]*[:=][\s]*["'][^"'\s]{8,}["']/i }
];

// Allowlisted values (false positives)
const ALLOWLIST = [
    'your-glpat-token-here',
    'your-api-token',
    'your-password',
    'process.env.',
    'GITLAB_API_TOKEN', // Variable name itself
    'JIRA_API_TOKEN',    // Variable name itself
    'GITLAB_URL',
    'JIRA_BASE_URL',
    'JIRA_EMAIL'
];

function scanFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        let issuesFound = false;

        lines.forEach((line, index) => {
            // Skip comments if possible (rudimentary check)
            if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;

            for (const pattern of SECRET_PATTERNS) {
                if (pattern.regex.test(line)) {
                    // Check allowlist
                    const isAllowed = ALLOWLIST.some(allowed => line.includes(allowed));
                    if (!isAllowed) {
                        console.error(`\x1b[31m[FAIL]\x1b[0m Potential ${pattern.name} found in \x1b[36m${filePath}:${index + 1}\x1b[0m`);
                        console.error(`       Match found: ${line.trim().substring(0, 100)}...`);
                        issuesFound = true;
                    }
                }
            }
        });
        return issuesFound;
    } catch (error) {
        console.error(`Error reading file ${filePath}: ${error.message}`);
        return false;
    }
}

function walkDir(dir) {
    let hasSecrets = false;
    const files = fs.readdirSync(dir);

    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            if (!IGNORED_DIRS.has(file)) {
                if (walkDir(fullPath)) hasSecrets = true;
            }
        } else {
            if (!IGNORED_FILES.has(file) && !file.endsWith('.log') && !file.endsWith('.png') && !file.endsWith('.jpg')) {
                if (scanFile(fullPath)) hasSecrets = true;
            }
        }
    }
    return hasSecrets;
}

console.log('🔍 Starting secret scan...');
const foundSecrets = walkDir(process.cwd());

if (foundSecrets) {
    console.error('\n\x1b[31m❌ Secrets detected! Please remove them before pushing.\x1b[0m');
    process.exit(1);
} else {
    console.log('\n\x1b[32m✅ No secrets found.\x1b[0m');
    process.exit(0);
}
