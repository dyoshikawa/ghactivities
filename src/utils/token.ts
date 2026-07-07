import { execFile } from "node:child_process";

export async function resolveGitHubToken(explicitToken?: string): Promise<string> {
  if (explicitToken) {
    return explicitToken;
  }

  const envToken = process.env["GITHUB_TOKEN"];
  if (envToken) {
    return envToken;
  }

  return getGhAuthToken();
}

function getGhAuthToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("gh", ["auth", "token"], (error, stdout, stderr) => {
      if (error) {
        reject(
          new Error(`Failed to get GitHub token from "gh auth token": ${stderr || error.message}`),
        );
        return;
      }
      const token = stdout.trim();
      if (!token) {
        reject(new Error('No token returned from "gh auth token"'));
        return;
      }
      resolve(token);
    });
  });
}
