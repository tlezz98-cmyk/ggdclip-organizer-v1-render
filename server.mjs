import { createServer } from "node:http";
import { access, link, mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, extname, join, normalize, parse, relative, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHmac, createSign, randomBytes, timingSafeEqual } from "node:crypto";

const root = fileURLToPath(new URL(".", import.meta.url));
const renderBaseUrl = process.env.RENDER_EXTERNAL_URL ||
  (process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : "");
const port = Number(process.env.PORT || (process.env.RENDER ? 10000 : 8787));
const host = process.env.HOST || (process.env.PORT ? "0.0.0.0" : "127.0.0.1");
const secureCookie = process.env.COOKIE_SECURE === "1" || process.env.NODE_ENV === "production";
const configPath = join(root, "config.json");
const defaultConfigPath = join(root, "config.online.json");
const indexPath = join(root, ".scan-index.json");
const taskStatePath = join(root, ".task-monitor-state.json");
const localDataRoots = [root, join(root, "assets"), resolve(root, "..")];
const videoExtensions = new Set([".mp4", ".mov", ".mkv", ".avi", ".m4v"]);
const summaryPositionGid = "1155912574";
const manualEntryGid = "2021660849";
const dashboardGid = "474599338";
const defaultAllowedEmails = ["suntzu.tutor.official@gmail.com", "tlezz98@gmail.com"];
const googleScopes = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.readonly"
];
const serviceAccountScopes = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.readonly"
];
const authSessions = new Map();
const oauthStates = new Map();
const serviceAccountTokenCache = { accessToken: "", expiresAt: 0, clientEmail: "" };
const reservedNames = /[<>:"/\\|?*\x00-\x1F]/g;
const thaiDigitMap = new Map([
  ["๐", "0"], ["๑", "1"], ["๒", "2"], ["๓", "3"], ["๔", "4"],
  ["๕", "5"], ["๖", "6"], ["๗", "7"], ["๘", "8"], ["๙", "9"]
]);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data, null, 2));
}

function cleanPathInput(path) {
  let value = String(path || "").trim();
  while (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    const wraps =
      (first === '"' && last === '"') ||
      (first === "'" && last === "'") ||
      (first === "“" && last === "”") ||
      (first === "‘" && last === "’");
    if (!wraps) break;
    value = value.slice(1, -1).trim();
  }
  return value;
}

function normalizeRoot(path) {
  return resolve(cleanPathInput(path));
}

function isInside(parent, child) {
  const parentPath = normalizeRoot(parent);
  const childPath = normalizeRoot(child);
  const relation = relative(parentPath, childPath);
  return relation === "" || Boolean(relation && !relation.startsWith("..") && !parse(relation).root);
}

function assertDestinationSafe(destinationRoot) {
  const destination = normalizeRoot(destinationRoot);
  const parsed = parse(destination);
  if (!destinationRoot || destination === parsed.root) {
    throw new Error("Destination folder is too broad or empty");
  }
  return destination;
}

function safeFilename(value, fallback = "clip") {
  const trimmed = String(value || fallback)
    .replace(reservedNames, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  return trimmed || fallback;
}

function outputExtension(mode) {
  if (mode === "cmd") return ".cmd";
  if (mode === "lnk") return ".lnk";
  if (mode === "copy" || mode === "hardlink") return "";
  return ".url";
}

function sameVolume(pathA, pathB) {
  return parse(resolve(pathA)).root.toLowerCase() === parse(resolve(pathB)).root.toLowerCase();
}

function buildOutputPlan({ destinationRoot, mode = "hardlink", groupBySubject = true, items = [] }) {
  const destination = assertDestinationSafe(destinationRoot);
  const extension = outputExtension(mode);
  const plan = [];
  const errors = [];

  items.forEach((item, index) => {
    const sourcePath = cleanPathInput(item.sourcePath || item.path || "");
    const sourceName = safeFilename(item.sourceName || item.name || `clip-${index + 1}`);
    const baseOutputName = safeFilename(item.outputName || `${String(index + 1).padStart(2, "0")} - ${sourceName}`);
    const finalName = mode === "copy" || mode === "hardlink" ? `${baseOutputName}${extname(sourcePath) || extname(sourceName)}` : `${baseOutputName}${extension}`;
    const folderName = safeFilename(item.folderName || item.subject || `subject-${index + 1}`);
    const outputDir = groupBySubject ? resolve(destination, folderName) : destination;
    const outputPath = resolve(outputDir, finalName);
    const relativeOutputPath = relative(destination, outputPath);
    const sourceOnSameVolume = sourcePath ? sameVolume(sourcePath, destination) : false;

    if (!sourcePath) errors.push(`Missing source path for item ${index + 1}`);
    if (!isInside(destination, outputPath)) errors.push(`Output path escaped destination: ${relativeOutputPath || finalName}`);
    if (mode === "hardlink" && sourcePath && !sourceOnSameVolume) {
      errors.push(`Hard Link requires same drive: ${sourcePath}`);
    }

    plan.push({
      subject: item.subject || "",
      sourcePath,
      outputName: finalName,
      folderName: groupBySubject ? folderName : "",
      outputDir,
      outputPath,
      relativeOutputPath,
      mode,
      sourceExists: false,
      sourceOnSameVolume
    });
  });

  return { destination, plan, errors };
}

async function enrichPlanSourceState(plan) {
  for (const item of plan) {
    try {
      await access(item.sourcePath);
      item.sourceExists = true;
    } catch {
      item.sourceExists = false;
    }
  }
}

async function checkOutputOrphans({ destinationRoot, mode = "hardlink", groupBySubject = true, items = [] }) {
  const { destination, plan, errors } = buildOutputPlan({ destinationRoot, mode, groupBySubject, items });
  const expected = new Set(plan.map(item => normalizeRoot(item.outputPath).toLowerCase()));
  const orphaned = [];
  const matching = [];

  try {
    const stack = [destination];
    while (stack.length) {
      const current = stack.pop();
      const entries = await readdir(current, { withFileTypes: true });
      for (const entry of entries) {
        const outputPath = resolve(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(outputPath);
          continue;
        }
      if (!entry.isFile()) continue;
      const extension = extname(entry.name).toLowerCase();
      if (mode === "hardlink" && !videoExtensions.has(extension)) continue;
      const stats = await stat(outputPath);
      const item = {
        name: entry.name,
        path: outputPath,
        relativePath: relative(destination, outputPath),
        sizeBytes: stats.size,
        modifiedMs: stats.mtimeMs
      };
      if (expected.has(normalizeRoot(outputPath).toLowerCase())) matching.push(item);
      else orphaned.push(item);
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  orphaned.sort((a, b) => a.name.localeCompare(b.name, "th"));
  matching.sort((a, b) => a.name.localeCompare(b.name, "th"));
  return { destination, plan, errors, orphaned, matching };
}

function createUrlShortcutBody(targetPath) {
  const fileUrl = encodeURI(`file:///${String(targetPath).replace(/\\/g, "/")}`);
  return `[InternetShortcut]\r\nURL=${fileUrl}\r\n`;
}

function createCmdShortcutBody(targetPath) {
  return `@echo off\r\nstart "" "${String(targetPath).replaceAll('"', '""')}"\r\n`;
}

function escapePowerShellSingleQuoted(value) {
  return String(value).replaceAll("'", "''");
}

function runPowerShell(command) {
  return new Promise((resolveLaunch, rejectLaunch) => {
    const encodedCommand = Buffer.from(command, "utf16le").toString("base64");
    const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodedCommand], {
      windowsHide: false
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) rejectLaunch(error);
      else resolveLaunch(result);
    };

    const timer = setTimeout(() => {
      child.kill();
      finish(new Error("เปิด Explorer ใช้เวลานานผิดปกติ"));
    }, 5000);

    child.stdout?.on("data", chunk => { stdout += chunk.toString("utf8"); });
    child.stderr?.on("data", chunk => { stderr += chunk.toString("utf8"); });
    child.once("error", error => finish(error));
    child.once("close", code => {
      if (code === 0) {
        finish(null, { method: "powershell Start-Process", exitCode: code, stdout: stdout.trim() });
        return;
      }
      finish(new Error(stderr.trim() || stdout.trim() || `PowerShell exited with code ${code}`));
    });
  });
}

async function revealInExplorer(targetPath) {
  const target = normalizeRoot(targetPath);
  await access(target);
  const safeTarget = escapePowerShellSingleQuoted(target);
  const command = `$target = '${safeTarget}'; Start-Process -FilePath explorer.exe -ArgumentList "/select,\`"$target\`""`;
  const launch = await runPowerShell(command);
  return { path: target, launch };
}

async function openContainingFolder(targetPath) {
  const target = normalizeRoot(targetPath);
  await access(target);
  const folder = dirname(target);
  const safeFolder = escapePowerShellSingleQuoted(folder);
  const command = `$folder = '${safeFolder}'; Start-Process -FilePath explorer.exe -ArgumentList "\`"$folder\`""`;
  const launch = await runPowerShell(command);
  return { folder, launch };
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

async function readAppConfig() {
  const defaults = await readJson(defaultConfigPath, {});
  const local = await readJson(configPath, null);
  return local ? { ...defaults, ...local } : defaults;
}

async function readRequestText(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function readRequestJson(req) {
  const raw = await readRequestText(req);
  return raw ? JSON.parse(raw) : {};
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return Object.fromEntries(header.split(";")
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const index = part.indexOf("=");
      if (index < 0) return [part, ""];
      return [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
    }));
}

function setAuthCookie(res, sessionId) {
  const secure = secureCookie ? "; Secure" : "";
  res.setHeader("Set-Cookie", `clip_auth=${encodeURIComponent(sessionId)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${secure}`);
}

function clearAuthCookie(res) {
  const secure = secureCookie ? "; Secure" : "";
  res.setHeader("Set-Cookie", `clip_auth=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`);
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

async function getAuthConfig() {
  const config = await readAppConfig();
  const oauth = config.googleOAuth || {};
  const clientId = process.env.GOOGLE_CLIENT_ID || oauth.clientId || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || oauth.clientSecret || "";
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ||
    (renderBaseUrl ? `${renderBaseUrl}/auth/google/callback` : "") ||
    oauth.redirectUri ||
    `http://127.0.0.1:${port}/auth/google/callback`;
  const envAllowedEmails = String(process.env.ALLOWED_EMAILS || "")
    .split(/[,;\n]/)
    .map(email => email.trim())
    .filter(Boolean);
  const allowedEmails = (envAllowedEmails.length ? envAllowedEmails : (config.allowedEmails?.length ? config.allowedEmails : defaultAllowedEmails))
    .map(email => String(email || "").trim().toLowerCase())
    .filter(Boolean);
  return {
    configured: Boolean(clientId && clientSecret),
    clientId,
    clientSecret,
    redirectUri,
    allowedEmails
  };
}

async function getServiceAccountConfig() {
  const config = await readAppConfig();
  const service = config.googleServiceAccount || {};
  let serviceJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "";
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || service.keyFile || "";
  if (!serviceJson && keyFile) {
    try {
      serviceJson = await readFile(keyFile, "utf8");
    } catch {}
  }

  let parsed = {};
  if (serviceJson.trim()) {
    try {
      parsed = JSON.parse(serviceJson);
    } catch {}
  }

  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
    parsed.client_email ||
    service.clientEmail ||
    "";
  const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ||
    parsed.private_key ||
    service.privateKey ||
    "")
    .replace(/\\n/g, "\n");

  return {
    configured: Boolean(clientEmail && privateKey),
    clientEmail,
    privateKey,
    projectId: parsed.project_id || service.projectId || "",
    keyFile
  };
}

async function getAppsScriptStatusWriterConfig() {
  const config = await readAppConfig();
  const writer = config.appsScriptStatusWriter || {};
  return {
    configured: Boolean(process.env.APPS_SCRIPT_STATUS_URL || writer.url),
    url: process.env.APPS_SCRIPT_STATUS_URL || writer.url || "",
    secret: process.env.APPS_SCRIPT_STATUS_SECRET || writer.secret || ""
  };
}

function publicAuthConfig(config) {
  return {
    configured: config.configured,
    redirectUri: config.redirectUri,
    allowedEmails: config.allowedEmails
  };
}

function publicServiceAccountConfig(config) {
  return {
    configured: config.configured,
    clientEmail: config.clientEmail || "",
    projectId: config.projectId || "",
    keyFile: config.keyFile || ""
  };
}

function publicAppsScriptStatusWriterConfig(config) {
  return {
    configured: Boolean(config.configured),
    url: config.url || ""
  };
}

async function getTelegramConfig() {
  const config = await readAppConfig();
  const telegram = config.telegram || {};
  const botToken = process.env.TELEGRAM_BOT_TOKEN || telegram.botToken || "";
  const chatId = process.env.TELEGRAM_CHAT_ID || telegram.chatId || "";
  const publicBaseUrl = process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || telegram.publicBaseUrl || renderBaseUrl || "";
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || telegram.webhookSecret || "";
  const dailySummaryTime = process.env.TELEGRAM_DAILY_SUMMARY_TIME || telegram.dailySummaryTime || "";
  const timeZone = process.env.TELEGRAM_TIME_ZONE || telegram.timeZone || "Asia/Bangkok";
  return {
    enabled: String(process.env.TELEGRAM_ENABLED || telegram.enabled || "").toLowerCase() === "true" || telegram.enabled === true,
    configured: Boolean(botToken && chatId),
    botToken,
    chatId: String(chatId || "").trim(),
    publicBaseUrl: String(publicBaseUrl || "").replace(/\/+$/, ""),
    webhookSecret: String(webhookSecret || "").trim(),
    dailySummaryTime: String(dailySummaryTime || "").trim(),
    timeZone,
    sendOnManualUpdate: telegram.sendOnManualUpdate === true || String(process.env.TELEGRAM_SEND_ON_MANUAL_UPDATE || "").toLowerCase() === "true",
    allowNaturalLanguage: telegram.allowNaturalLanguage !== false,
    allowedChatId: String(process.env.TELEGRAM_ALLOWED_CHAT_ID || telegram.allowedChatId || chatId || "").trim()
  };
}

function publicTelegramConfig(config) {
  return {
    enabled: Boolean(config.enabled),
    configured: Boolean(config.configured),
    chatId: config.chatId || "",
    publicBaseUrl: config.publicBaseUrl || "",
    dailySummaryTime: config.dailySummaryTime || "",
    timeZone: config.timeZone || "Asia/Bangkok",
    sendOnManualUpdate: Boolean(config.sendOnManualUpdate),
    allowNaturalLanguage: config.allowNaturalLanguage !== false,
    webhookReady: Boolean(config.configured && config.publicBaseUrl && config.webhookSecret)
  };
}

async function getLineConfig() {
  const config = await readAppConfig();
  const line = config.line || {};
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || line.channelAccessToken || "";
  const channelSecret = process.env.LINE_CHANNEL_SECRET || line.channelSecret || "";
  const targetId = process.env.LINE_TARGET_ID || process.env.LINE_GROUP_ID || line.targetId || line.groupId || "";
  const publicBaseUrl = process.env.LINE_PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || line.publicBaseUrl || renderBaseUrl || "";
  const dailySummaryTime = process.env.LINE_DAILY_SUMMARY_TIME || line.dailySummaryTime || "";
  const timeZone = process.env.LINE_TIME_ZONE || line.timeZone || "Asia/Bangkok";
  const enabled = String(process.env.LINE_ENABLED || line.enabled || "").toLowerCase() === "true" || line.enabled === true;
  return {
    enabled,
    configured: Boolean(channelAccessToken && (targetId || channelSecret)),
    channelAccessToken,
    channelSecret: String(channelSecret || "").trim(),
    targetId: String(targetId || "").trim(),
    publicBaseUrl: String(publicBaseUrl || "").replace(/\/+$/, ""),
    dailySummaryTime: String(dailySummaryTime || "").trim(),
    timeZone,
    sendOnManualUpdate: line.sendOnManualUpdate === true || String(process.env.LINE_SEND_ON_MANUAL_UPDATE || "").toLowerCase() === "true",
    allowNaturalLanguage: line.allowNaturalLanguage !== false,
    allowedSourceId: String(process.env.LINE_ALLOWED_SOURCE_ID || line.allowedSourceId || targetId || "").trim()
  };
}

function publicLineConfig(config) {
  return {
    enabled: Boolean(config.enabled),
    configured: Boolean(config.configured),
    targetId: config.targetId || "",
    publicBaseUrl: config.publicBaseUrl || "",
    dailySummaryTime: config.dailySummaryTime || "",
    timeZone: config.timeZone || "Asia/Bangkok",
    sendOnManualUpdate: Boolean(config.sendOnManualUpdate),
    allowNaturalLanguage: config.allowNaturalLanguage !== false,
    webhookReady: Boolean(config.enabled && config.channelAccessToken && config.channelSecret && config.publicBaseUrl)
  };
}

function sanitizeConfigForClient(config) {
  return {
    ...config,
    googleOAuth: config.googleOAuth ? {
      ...config.googleOAuth,
      clientSecret: config.googleOAuth.clientSecret ? "__CONFIGURED__" : ""
    } : undefined,
    googleServiceAccount: config.googleServiceAccount ? {
      ...config.googleServiceAccount,
      privateKey: config.googleServiceAccount.privateKey ? "__CONFIGURED__" : ""
    } : undefined,
    appsScriptStatusWriter: config.appsScriptStatusWriter ? {
      ...config.appsScriptStatusWriter,
      secret: config.appsScriptStatusWriter.secret ? "__CONFIGURED__" : ""
    } : undefined,
    telegram: config.telegram ? {
      ...config.telegram,
      botToken: config.telegram.botToken ? "__CONFIGURED__" : "",
      webhookSecret: config.telegram.webhookSecret ? "__CONFIGURED__" : ""
    } : undefined,
    line: config.line ? {
      ...config.line,
      channelAccessToken: config.line.channelAccessToken ? "__CONFIGURED__" : "",
      channelSecret: config.line.channelSecret ? "__CONFIGURED__" : ""
    } : undefined
  };
}

function mergeConfigForSave(existingConfig, nextConfig) {
  const merged = {
    ...existingConfig,
    ...nextConfig
  };
  if (existingConfig.googleOAuth || nextConfig.googleOAuth) {
    merged.googleOAuth = {
      ...(existingConfig.googleOAuth || {}),
      ...(nextConfig.googleOAuth || {})
    };
    if (merged.googleOAuth.clientSecret === "__CONFIGURED__") {
      merged.googleOAuth.clientSecret = existingConfig.googleOAuth?.clientSecret || "";
    }
  }
  if (existingConfig.googleServiceAccount || nextConfig.googleServiceAccount) {
    merged.googleServiceAccount = {
      ...(existingConfig.googleServiceAccount || {}),
      ...(nextConfig.googleServiceAccount || {})
    };
    if (merged.googleServiceAccount.privateKey === "__CONFIGURED__") {
      merged.googleServiceAccount.privateKey = existingConfig.googleServiceAccount?.privateKey || "";
    }
  }
  if (existingConfig.appsScriptStatusWriter || nextConfig.appsScriptStatusWriter) {
    merged.appsScriptStatusWriter = {
      ...(existingConfig.appsScriptStatusWriter || {}),
      ...(nextConfig.appsScriptStatusWriter || {})
    };
    if (merged.appsScriptStatusWriter.secret === "__CONFIGURED__") {
      merged.appsScriptStatusWriter.secret = existingConfig.appsScriptStatusWriter?.secret || "";
    }
  }
  if (existingConfig.telegram || nextConfig.telegram) {
    merged.telegram = {
      ...(existingConfig.telegram || {}),
      ...(nextConfig.telegram || {})
    };
    if (merged.telegram.botToken === "__CONFIGURED__") {
      merged.telegram.botToken = existingConfig.telegram?.botToken || "";
    }
    if (merged.telegram.webhookSecret === "__CONFIGURED__") {
      merged.telegram.webhookSecret = existingConfig.telegram?.webhookSecret || "";
    }
  }
  if (existingConfig.line || nextConfig.line) {
    merged.line = {
      ...(existingConfig.line || {}),
      ...(nextConfig.line || {})
    };
    if (merged.line.channelAccessToken === "__CONFIGURED__") {
      merged.line.channelAccessToken = existingConfig.line?.channelAccessToken || "";
    }
    if (merged.line.channelSecret === "__CONFIGURED__") {
      merged.line.channelSecret = existingConfig.line?.channelSecret || "";
    }
  }
  if (existingConfig.allowedEmails || nextConfig.allowedEmails) {
    merged.allowedEmails = nextConfig.allowedEmails || existingConfig.allowedEmails || defaultAllowedEmails;
  }
  return merged;
}

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function getServiceAccountAuth() {
  const config = await getServiceAccountConfig();
  if (!config.configured) return null;
  if (serviceAccountTokenCache.accessToken &&
      serviceAccountTokenCache.clientEmail === config.clientEmail &&
      Date.now() < serviceAccountTokenCache.expiresAt - 60_000) {
    return {
      accessToken: serviceAccountTokenCache.accessToken,
      source: "serviceAccount",
      email: config.clientEmail
    };
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64UrlEncode(JSON.stringify({
    iss: config.clientEmail,
    scope: serviceAccountScopes.join(" "),
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  }));
  const unsignedJwt = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsignedJwt);
  signer.end();
  const signature = signer.sign(config.privateKey, "base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  const assertion = `${unsignedJwt}.${signature}`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  const token = await tokenResponse.json();
  if (!tokenResponse.ok || !token.access_token) {
    throw new Error(token.error_description || token.error || "Service Account token ไม่สำเร็จ");
  }
  serviceAccountTokenCache.accessToken = token.access_token;
  serviceAccountTokenCache.expiresAt = Date.now() + Math.max(300, Number(token.expires_in || 3600) - 60) * 1000;
  serviceAccountTokenCache.clientEmail = config.clientEmail;
  return {
    accessToken: serviceAccountTokenCache.accessToken,
    source: "serviceAccount",
    email: config.clientEmail
  };
}

async function refreshAccessToken(session) {
  if (!session?.refreshToken) return null;
  const config = await getAuthConfig();
  if (!config.configured) return null;
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: session.refreshToken,
      grant_type: "refresh_token"
    })
  });
  const token = await tokenResponse.json();
  if (!tokenResponse.ok || !token.access_token) return null;
  session.accessToken = token.access_token;
  session.expiresAt = Date.now() + Math.max(300, Number(token.expires_in || 3600) - 60) * 1000;
  return session;
}

async function getRequestAuth(req) {
  const sessionId = parseCookies(req).clip_auth;
  if (!sessionId) return null;
  const session = authSessions.get(sessionId);
  if (!session) return null;
  if (session.expiresAt && Date.now() > session.expiresAt) {
    const refreshed = await refreshAccessToken(session);
    if (refreshed) {
      authSessions.set(sessionId, refreshed);
      return refreshed;
    }
    authSessions.delete(sessionId);
    return null;
  }
  return session;
}

async function shouldRequireLogin() {
  const config = await readAppConfig();
  const authConfig = await getAuthConfig();
  return Boolean(authConfig.configured && config.requireLogin !== false);
}

async function requireAppSession(req) {
  if (!await shouldRequireLogin()) return null;
  const session = await getRequestAuth(req);
  if (!session?.email) {
    const error = new Error("กรุณาเข้าสู่ระบบ Google ด้วยอีเมลที่ได้รับอนุญาตก่อนใช้งานข้อมูล private");
    error.statusCode = 401;
    throw error;
  }
  return session;
}

async function getSheetAuth(req) {
  const serviceConfig = await getServiceAccountConfig();
  if (serviceConfig.configured) {
    try {
      return await getServiceAccountAuth();
    } catch (error) {
      const userSession = await requireAppSession(req);
      if (userSession?.accessToken) return userSession;
      throw new Error(`Service Account อ่าน Google Sheet ไม่สำเร็จ: ${error.message || error}`);
    }
  }
  return await requireAppSession(req) || getRequestAuth(req);
}

async function getBackgroundSheetAuth() {
  const serviceConfig = await getServiceAccountConfig();
  if (!serviceConfig.configured) return null;
  return getServiceAccountAuth();
}

async function requireAllowedGoogleUser(token) {
  const userResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${token.access_token}` }
  });
  if (!userResponse.ok) throw new Error("โหลดข้อมูลผู้ใช้ Google ไม่สำเร็จ");
  const user = await userResponse.json();
  const email = String(user.email || "").toLowerCase();
  const config = await getAuthConfig();
  if (!config.allowedEmails.includes(email)) {
    throw new Error(`อีเมลนี้ยังไม่ได้รับอนุญาต: ${email}`);
  }
  return { email, name: user.name || email, picture: user.picture || "" };
}

async function scanVideos(sourceRoot) {
  const rootStats = await stat(sourceRoot);
  if (!rootStats.isDirectory()) {
    throw new Error("Source path is not a folder");
  }

  const videos = [];
  const stack = [sourceRoot];

  while (stack.length) {
    const current = stack.pop();
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;

      const extension = extname(entry.name).toLowerCase();
      if (!videoExtensions.has(extension)) continue;

      const fileStats = await stat(fullPath);
      videos.push({
        name: entry.name,
        path: fullPath,
        relativePath: relative(sourceRoot, fullPath),
        extension,
        sizeBytes: fileStats.size,
        modifiedMs: fileStats.mtimeMs
      });
    }
  }

  videos.sort((a, b) => a.relativePath.localeCompare(b.relativePath, "th"));
  return videos;
}

function normalizeThaiDigits(value) {
  return String(value || "").replace(/[๐-๙]/g, digit => thaiDigitMap.get(digit) || digit);
}

function extractYears(value) {
  const normalized = normalizeThaiDigits(value);
  const years = new Set();
  for (const match of normalized.matchAll(/(?:25|26)\d{2}/g)) {
    years.add(match[0]);
  }
  return [...years];
}

function detectVersionTags(value) {
  const text = normalizeThaiDigits(value).toLowerCase();
  const tags = [];
  if (/(update|updated|new|latest|final|rev|v\d+|version|แก้|ใหม่|ล่าสุด|อัปเดต|ปรับปรุง)/i.test(text)) {
    tags.push("version-tag");
  }
  if (/(ep|part|ตอน|ครั้ง|ชุด)\s*[-_ ]*\d+/i.test(text)) {
    tags.push("episode");
  }
  return tags;
}

function enrichSearchResults(results) {
  const termCounts = new Map();
  const termLatestMs = new Map();

  for (const file of results) {
    for (const term of file.matchedTerms || []) {
      termCounts.set(term, (termCounts.get(term) || 0) + 1);
      termLatestMs.set(term, Math.max(termLatestMs.get(term) || 0, file.modifiedMs || 0));
    }
  }

  return results.map(file => {
    const matchedTerms = file.matchedTerms || [];
    const versionConflict = matchedTerms.some(term => (termCounts.get(term) || 0) > 1);
    const newestForAnyTerm = matchedTerms.some(term => (file.modifiedMs || 0) === (termLatestMs.get(term) || 0));
    return {
      ...file,
      modifiedIso: file.modifiedMs ? new Date(file.modifiedMs).toISOString() : "",
      years: extractYears(`${file.name} ${file.relativePath}`),
      versionTags: detectVersionTags(`${file.name} ${file.relativePath}`),
      versionConflict,
      newestForAnyTerm
    };
  });
}

function extractSpreadsheetId(sheetUrl) {
  const value = String(sheetUrl || "").trim();
  const match = value.match(/\/spreadsheets\/d\/([^/]+)/);
  return match ? match[1] : value;
}

function extractSheetGid(sheetUrl, fallback = "0") {
  const value = String(sheetUrl || "").trim();
  const match = value.match(/[?#&]gid=(\d+)/);
  return match ? match[1] : fallback;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some(value => value !== "")) rows.push(row);
  return rows;
}

function cleanCell(value) {
  return String(value || "").replace(/^\uFEFF/u, "").trim();
}

function columnIndex(header, names) {
  const cleanHeader = header.map(cleanCell);
  for (const name of names) {
    const index = cleanHeader.indexOf(name);
    if (index >= 0) return index;
  }
  return -1;
}

const clipLinkStatusHeaders = [
  "สถานะลิงก์คลิป",
  "สถานะลิงค์คลิป",
  "สถานะลงก์คลิป",
  "สถานะลงค์คลิป",
  "สถานะคลิป",
  "สถานะ",
  "สถานะลิงก์คลิป",
  "สถานะลิงค์คลิป",
  "สถานะลงก์คลิป",
  "สถานะลงค์คลิป",
  "สถานะคลิป",
  "สถานะ"
];

const documentStatusHeaders = [
  "สถานะลิงก์เอกสาร",
  "สถานะลิงค์เอกสาร",
  "สถานะเอกสาร",
  "ลิงก์เอกสาร",
  "ลิงค์เอกสาร",
  "สถานะลิงก์เอกสาร",
  "สถานะลิงค์เอกสาร",
  "สถานะเอกสาร",
  "ลิงก์เอกสาร",
  "ลิงค์เอกสาร"
];

const latestUpdateHeaders = [
  "อัปเดตล่าสุด",
  "อัพเดตล่าสุด",
  "แก้ไขล่าสุด",
  "ล่าสุด"
];

const latestUpdateItemHeaders = [
  "รายการอัปเดตล่าสุด",
  "รายการอัพเดตล่าสุด",
  "วิชาที่อัปเดตล่าสุด",
  "วิชาที่อัพเดตล่าสุด"
];

const updateHistoryHeaders = [
  "ประวัติอัปเดต",
  "ประวัติการอัปเดต",
  "ประวัติอัพเดต",
  "ประวัติการอัพเดต"
];

function findHeaderIndex(rows, names) {
  return rows.findIndex(row => names.every(name => row.map(cleanCell).includes(name)));
}

function parseCount(value) {
  const number = Number(String(value || "").replace(/[,%\s]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function isUrl(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function normalizeSubjectKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()_.\-–—/]/g, "");
}

function normalizeGroupKey(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function parseUpdateHistoryEntries(value) {
  const text = cleanCell(value);
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed
        .map(entry => ({
          at: cleanCell(entry?.at),
          type: cleanCell(entry?.type),
          status: cleanCell(entry?.status),
          title: cleanCell(entry?.title)
        }))
        .filter(entry => entry.at || entry.title || entry.status);
    }
  } catch {}
  return text.split(/\r?\n/)
    .map(line => cleanCell(line))
    .filter(Boolean)
    .map(line => ({ at: "", type: "", status: "", title: line }));
}

function isDuplicateHistoryEntry(a, b) {
  if (!a || !b) return false;
  const sameCore =
    cleanCell(a.type) === cleanCell(b.type) &&
    cleanCell(a.status) === cleanCell(b.status) &&
    normalizeSubjectKey(a.title) === normalizeSubjectKey(b.title);
  if (!sameCore) return false;
  const firstTime = Date.parse(a.at || "");
  const secondTime = Date.parse(b.at || "");
  if (!Number.isFinite(firstTime) || !Number.isFinite(secondTime)) return true;
  return Math.abs(firstTime - secondTime) <= 15_000;
}

function buildUpdateHistoryValue(existingValue, nextEntry) {
  const existingEntries = parseUpdateHistoryEntries(existingValue)
    .filter(entry => entry && (entry.at || entry.title || entry.status));
  const entries = isDuplicateHistoryEntry(nextEntry, existingEntries[0])
    ? existingEntries
    : [nextEntry, ...existingEntries];
  return JSON.stringify(entries.slice(0, 5));
}

const csvCache = new Map();
const csvCacheTtlMs = Number(process.env.CSV_CACHE_TTL_MS || 45_000);

function getCachedCsv(key) {
  const hit = csvCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.time > csvCacheTtlMs) {
    csvCache.delete(key);
    return null;
  }
  return hit.text;
}

function setCachedCsv(key, text) {
  csvCache.set(key, { text, time: Date.now() });
  if (csvCache.size > 40) {
    const oldestKey = csvCache.keys().next().value;
    if (oldestKey) csvCache.delete(oldestKey);
  }
}

function columnNumberToA1(index) {
  let n = Number(index) + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function sameSheetKey(a, b) {
  return cleanCell(a).replace(/\s+/g, " ").toLowerCase() === cleanCell(b).replace(/\s+/g, " ").toLowerCase();
}

async function fetchPublicCsv(csvUrl) {
  const cacheKey = `public:${csvUrl}`;
  const cached = getCachedCsv(cacheKey);
  if (cached !== null) return { ok: true, text: cached, cached: true };

  const publicResponse = await fetch(csvUrl);
  const publicType = publicResponse.headers.get("content-type") || "";
  if (publicResponse.ok && !publicType.includes("text/html")) {
    const text = await publicResponse.text();
    setCachedCsv(cacheKey, text);
    return { ok: true, text };
  }
  return { ok: false, status: publicResponse.status, contentType: publicType };
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function rowsToCsv(rows) {
  return (rows || []).map(row => (row || []).map(csvEscape).join(",")).join("\r\n");
}

function sheetsRangeForWholeSheet(sheetName) {
  return `'${String(sheetName || "").replace(/'/g, "''")}'`;
}

async function fetchGoogleJson(apiUrl, auth) {
  if (!auth?.accessToken) {
    throw new Error("ชีตนี้เป็น private กรุณาตั้งค่า Service Account ให้แอพอ่านชีต หรือเข้าสู่ระบบ Google ด้วยอีเมลที่ได้รับอนุญาต");
  }
  const response = await fetch(apiUrl, {
    headers: { Authorization: `Bearer ${auth.accessToken}` }
  });
  const json = await response.json().catch(() => ({}));
  if (response.ok) return json;
  if (response.status === 401 || response.status === 403) {
    throw new Error("บัญชีที่แอพใช้ยังไม่มีสิทธิ์อ่านชีต/ไฟล์นี้ กรุณาแชร์ชีตให้ Service Account หรือเข้าสู่ระบบใหม่ด้วยอีเมลที่มีสิทธิ์");
  }
  throw new Error(json.error?.message || `โหลดข้อมูลจาก Google API ไม่สำเร็จ (${response.status})`);
}

async function fetchSheetTitleByGid(spreadsheetId, gid, auth) {
  const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(sheetId,title))`;
  const metadata = await fetchGoogleJson(apiUrl, auth);
  const numericGid = Number(gid);
  const sheet = (metadata.sheets || []).find(item => Number(item.properties?.sheetId) === numericGid);
  if (!sheet?.properties?.title) throw new Error(`ไม่พบแท็บชีต gid ${gid}`);
  return sheet.properties.title;
}

async function fetchPrivateSheetCsvByName(spreadsheetId, sheetName, auth) {
  const cacheKey = `private:${spreadsheetId}:${sheetName}`;
  const cached = getCachedCsv(cacheKey);
  if (cached !== null) return cached;

  const range = encodeURIComponent(sheetsRangeForWholeSheet(sheetName));
  const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
  const data = await fetchGoogleJson(apiUrl, auth);
  const text = rowsToCsv(data.values || []);
  setCachedCsv(cacheKey, text);
  return text;
}

async function updateGoogleSheetCell(spreadsheetId, sheetName, rowNumber, columnIndexValue, value, auth) {
  if (!auth?.accessToken) {
    throw new Error("ต้องตั้งค่า Service Account หรือเข้าสู่ระบบ Google ที่มีสิทธิ์แก้ชีตก่อน");
  }
  const column = columnNumberToA1(columnIndexValue);
  const range = `${sheetsRangeForWholeSheet(sheetName)}!${column}${rowNumber}`;
  const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const response = await fetch(apiUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ values: [[value]] })
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("บัญชีที่แอพใช้ยังไม่มีสิทธิ์แก้ Google Sheet นี้ กรุณาแชร์ชีตให้ Service Account เป็น Editor");
    }
    throw new Error(json.error?.message || `เขียน Google Sheet ไม่สำเร็จ (${response.status})`);
  }
  csvCache.clear();
  return { range, updatedCells: json.updatedCells || 0 };
}

async function updateGoogleSheetValuesBatch(spreadsheetId, data, auth) {
  if (!auth?.accessToken) {
    throw new Error("ต้องตั้งค่า Service Account หรือเข้าสู่ระบบ Google ที่มีสิทธิ์แก้ชีตก่อน");
  }
  const updates = (data || []).filter(item => item?.range && Array.isArray(item.values));
  if (!updates.length) return { updatedCells: 0, responses: [] };
  const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      valueInputOption: "USER_ENTERED",
      data: updates
    })
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("บัญชีที่แอพใช้ยังไม่มีสิทธิ์แก้ Google Sheet นี้ กรุณาแชร์ชีตให้ Service Account เป็น Editor");
    }
    throw new Error(json.error?.message || `เขียน Google Sheet ไม่สำเร็จ (${response.status})`);
  }
  csvCache.clear();
  return {
    updatedCells: json.totalUpdatedCells || 0,
    responses: json.responses || []
  };
}

async function batchUpdateSpreadsheet(spreadsheetId, requests, auth) {
  if (!auth?.accessToken) {
    throw new Error("ต้องตั้งค่า Service Account หรือเข้าสู่ระบบ Google ที่มีสิทธิ์แก้ชีตก่อน");
  }
  const bodyRequests = (requests || []).filter(Boolean);
  if (!bodyRequests.length) return { replies: [] };
  const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ requests: bodyRequests })
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("บัญชีที่แอพใช้ยังไม่มีสิทธิ์แก้ Google Sheet นี้ กรุณาแชร์ชีตให้ Service Account เป็น Editor");
    }
    throw new Error(json.error?.message || `แก้โครงสร้าง Google Sheet ไม่สำเร็จ (${response.status})`);
  }
  csvCache.clear();
  return { replies: json.replies || [] };
}

function sheetCellRange(sheetName, rowNumber, columnIndexValue) {
  const column = columnNumberToA1(columnIndexValue);
  return `${sheetsRangeForWholeSheet(sheetName)}!${column}${rowNumber}`;
}

function sheetRowRange(sheetName, rowNumber, columnCount) {
  const lastColumn = columnNumberToA1(Math.max(0, Number(columnCount || 1) - 1));
  return `${sheetsRangeForWholeSheet(sheetName)}!A${rowNumber}:${lastColumn}${rowNumber}`;
}

function parseSubjectOrder(value) {
  const match = String(value || "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

function subjectSheetIndexes(header) {
  return {
    positionIndex: columnIndex(header, ["ตำแหน่ง"]),
    groupIndex: columnIndex(header, ["กลุ่ม"]),
    orderIndex: columnIndex(header, ["ลำดับ"]),
    subjectIndex: columnIndex(header, ["ชื่อวิชา/หัวข้อ"]),
    statusIndex: columnIndex(header, clipLinkStatusHeaders),
    documentStatusIndex: columnIndex(header, documentStatusHeaders),
    latestUpdateIndex: columnIndex(header, latestUpdateHeaders),
    latestUpdateItemIndex: columnIndex(header, latestUpdateItemHeaders),
    updateHistoryIndex: columnIndex(header, updateHistoryHeaders),
    reusableIndex: columnIndex(header, ["ใช้สอนได้หลายกลุ่ม"]),
    linkIndex: columnIndex(header, ["ลิงก์โพสต์/กลุ่ม", "ลิงก์กลุ่ม", "Facebook"]),
    noteIndex: columnIndex(header, ["หมายเหตุ"]),
    clipStatusIndex: columnIndex(header, ["ลงคลิป"])
  };
}

function subjectRowsForPosition(rows, indexes, position) {
  return rows.slice(1)
    .map((row, index) => ({
      row,
      rowNumber: index + 2,
      order: cleanCell(row[indexes.orderIndex]),
      orderNumber: parseSubjectOrder(row[indexes.orderIndex]),
      title: cleanCell(row[indexes.subjectIndex])
    }))
    .filter(item => sameSheetKey(item.row[indexes.positionIndex], position) && item.title);
}

function buildInsertedSubjectRow({ headerLength, indexes, templateRow, position, order, title, updatedAt }) {
  const row = Array.from({ length: headerLength }, () => "");
  if (indexes.positionIndex >= 0) row[indexes.positionIndex] = position;
  if (indexes.groupIndex >= 0) row[indexes.groupIndex] = cleanCell(templateRow?.[indexes.groupIndex]);
  if (indexes.orderIndex >= 0) row[indexes.orderIndex] = String(order);
  if (indexes.subjectIndex >= 0) row[indexes.subjectIndex] = title;
  if (indexes.statusIndex >= 0) row[indexes.statusIndex] = "ยังไม่ลงลิงก์";
  if (indexes.documentStatusIndex >= 0) row[indexes.documentStatusIndex] = "ยังไม่ลงลิงก์";
  if (indexes.reusableIndex >= 0) row[indexes.reusableIndex] = cleanCell(templateRow?.[indexes.reusableIndex]);
  if (indexes.linkIndex >= 0) row[indexes.linkIndex] = cleanCell(templateRow?.[indexes.linkIndex]);
  if (indexes.latestUpdateIndex >= 0) row[indexes.latestUpdateIndex] = updatedAt;
  if (indexes.latestUpdateItemIndex >= 0) row[indexes.latestUpdateItemIndex] = `แทรกวิชา: ${title}`;
  if (indexes.updateHistoryIndex >= 0) {
    row[indexes.updateHistoryIndex] = buildUpdateHistoryValue("", {
      at: updatedAt,
      type: "subject-insert",
      status: `ลำดับ ${order}`,
      title
    });
  }
  return row;
}

function findUniqueSubjectRow(rows, indexes, payload) {
  const position = cleanCell(payload.position);
  const order = cleanCell(payload.order);
  const title = cleanCell(payload.title);
  const matches = rows.slice(1)
    .map((row, index) => ({ row, rowNumber: index + 2 }))
    .filter(({ row }) =>
      sameSheetKey(row[indexes.positionIndex], position) &&
      sameSheetKey(row[indexes.orderIndex], order) &&
      sameSheetKey(row[indexes.subjectIndex], title)
    );
  if (matches.length !== 1) {
    throw new Error(matches.length === 0
      ? "ไม่พบแถววิชาที่ตรงกับตำแหน่ง/ลำดับ/ชื่อวิชานี้"
      : `พบ ${matches.length} แถวที่ตรงกัน จึงยังไม่แก้เพื่อกันผิดแถว`);
  }
  return matches[0];
}

async function updateSubjectCatalog(sheetUrl, payload, auth = null) {
  const spreadsheetId = extractSpreadsheetId(sheetUrl);
  if (!spreadsheetId) throw new Error("ไม่พบ spreadsheet id");
  const action = cleanCell(payload.action);
  if (!["rename", "insert", "delete"].includes(action)) throw new Error("คำสั่งแก้วิชาไม่ถูกต้อง");

  const csvText = await fetchSheetCsv(spreadsheetId, manualEntryGid, auth);
  const rows = parseCsv(csvText);
  const header = rows[0] || [];
  const indexes = subjectSheetIndexes(header);
  if (indexes.positionIndex < 0 || indexes.orderIndex < 0 || indexes.subjectIndex < 0) {
    throw new Error("ไม่พบคอลัมน์ตำแหน่ง/ลำดับ/ชื่อวิชาในชีต");
  }

  const sheetName = await fetchSheetTitleByGid(spreadsheetId, manualEntryGid, auth);
  const updatedAt = new Date().toISOString();

  if (action === "rename") {
    const newTitle = cleanCell(payload.newTitle);
    if (!newTitle) throw new Error("กรุณาใส่ชื่อวิชาใหม่");
    const match = findUniqueSubjectRow(rows, indexes, payload);
    const previousTitle = cleanCell(match.row[indexes.subjectIndex]);
    if (sameSheetKey(previousTitle, newTitle)) throw new Error("ชื่อวิชาใหม่เหมือนเดิม");

    const data = [
      {
        range: sheetCellRange(sheetName, match.rowNumber, indexes.subjectIndex),
        values: [[newTitle]]
      }
    ];
    if (indexes.latestUpdateIndex >= 0) {
      data.push({ range: sheetCellRange(sheetName, match.rowNumber, indexes.latestUpdateIndex), values: [[updatedAt]] });
    }
    if (indexes.latestUpdateItemIndex >= 0) {
      data.push({ range: sheetCellRange(sheetName, match.rowNumber, indexes.latestUpdateItemIndex), values: [[`แก้ชื่อวิชา: ${previousTitle} → ${newTitle}`]] });
    }
    if (indexes.updateHistoryIndex >= 0) {
      const history = buildUpdateHistoryValue(match.row[indexes.updateHistoryIndex], {
        at: updatedAt,
        type: "subject-rename",
        status: cleanCell(payload.order),
        title: `${previousTitle} → ${newTitle}`
      });
      data.push({ range: sheetCellRange(sheetName, match.rowNumber, indexes.updateHistoryIndex), values: [[history]] });
    }
    const update = await updateGoogleSheetValuesBatch(spreadsheetId, data, auth);
    return {
      action,
      spreadsheetId,
      gid: manualEntryGid,
      rowNumber: match.rowNumber,
      position: cleanCell(payload.position),
      order: cleanCell(payload.order),
      previousTitle,
      title: newTitle,
      updatedAt,
      updatedCells: update.updatedCells
    };
  }

  if (action === "delete") {
    const match = findUniqueSubjectRow(rows, indexes, payload);
    const position = cleanCell(payload.position);
    const deletedOrder = parseSubjectOrder(payload.order);
    if (!position || !Number.isFinite(deletedOrder)) throw new Error("ข้อมูลตำแหน่ง/ลำดับไม่ครบสำหรับลบวิชา");
    const previousTitle = cleanCell(match.row[indexes.subjectIndex]);
    const shiftedRows = subjectRowsForPosition(rows, indexes, position)
      .filter(item => Number.isFinite(item.orderNumber) && item.orderNumber > deletedOrder)
      .sort((a, b) => a.rowNumber - b.rowNumber);

    await batchUpdateSpreadsheet(spreadsheetId, [{
      deleteDimension: {
        range: {
          sheetId: Number(manualEntryGid),
          dimension: "ROWS",
          startIndex: match.rowNumber - 1,
          endIndex: match.rowNumber
        }
      }
    }], auth);

    const data = shiftedRows.map(item => ({
      range: sheetCellRange(
        sheetName,
        item.rowNumber > match.rowNumber ? item.rowNumber - 1 : item.rowNumber,
        indexes.orderIndex
      ),
      values: [[String(item.orderNumber - 1)]]
    }));
    const update = await updateGoogleSheetValuesBatch(spreadsheetId, data, auth);
    return {
      action,
      spreadsheetId,
      gid: manualEntryGid,
      rowNumber: match.rowNumber,
      position,
      order: String(deletedOrder),
      previousTitle,
      title: previousTitle,
      shiftedCount: shiftedRows.length,
      shiftedFromOrder: String(deletedOrder + 1),
      updatedAt,
      updatedCells: update.updatedCells
    };
  }

  const position = cleanCell(payload.position);
  const title = cleanCell(payload.title || payload.newTitle);
  const insertOrder = parseSubjectOrder(payload.insertOrder || payload.order);
  if (!position) throw new Error("กรุณาเลือกตำแหน่งก่อนแทรกวิชา");
  if (!title) throw new Error("กรุณาใส่ชื่อวิชาที่จะแทรก");
  if (!Number.isFinite(insertOrder) || insertOrder < 1) throw new Error("ลำดับที่จะแทรกต้องเป็นตัวเลขมากกว่า 0");

  const positionRows = subjectRowsForPosition(rows, indexes, position);
  if (!positionRows.length) throw new Error("ยังไม่พบรายวิชาของตำแหน่งนี้ในชีต");
  const duplicateAtOrder = positionRows.find(item =>
    Number(item.orderNumber) === Number(insertOrder) &&
    sameSheetKey(item.title, title)
  );
  if (duplicateAtOrder) throw new Error("มีวิชาชื่อนี้อยู่ที่ลำดับนี้แล้ว");

  const shiftedRows = positionRows
    .filter(item => Number.isFinite(item.orderNumber) && item.orderNumber >= insertOrder)
    .sort((a, b) => a.rowNumber - b.rowNumber);
  const lastPositionRow = positionRows.slice().sort((a, b) => a.rowNumber - b.rowNumber).at(-1);
  const insertRowNumber = shiftedRows[0]?.rowNumber || (lastPositionRow.rowNumber + 1);
  const templateRow = shiftedRows[0]?.row || lastPositionRow.row;

  await batchUpdateSpreadsheet(spreadsheetId, [{
    insertDimension: {
      range: {
        sheetId: Number(manualEntryGid),
        dimension: "ROWS",
        startIndex: insertRowNumber - 1,
        endIndex: insertRowNumber
      },
      inheritFromBefore: insertRowNumber > 2
    }
  }], auth);

  const insertedRow = buildInsertedSubjectRow({
    headerLength: header.length,
    indexes,
    templateRow,
    position,
    order: insertOrder,
    title,
    updatedAt
  });
  const data = [
    {
      range: sheetRowRange(sheetName, insertRowNumber, header.length),
      values: [insertedRow]
    },
    ...shiftedRows.map(item => {
      const adjustedRowNumber = item.rowNumber >= insertRowNumber ? item.rowNumber + 1 : item.rowNumber;
      return {
        range: sheetCellRange(sheetName, adjustedRowNumber, indexes.orderIndex),
        values: [[String(item.orderNumber + 1)]]
      };
    })
  ];
  const update = await updateGoogleSheetValuesBatch(spreadsheetId, data, auth);
  return {
    action,
    spreadsheetId,
    gid: manualEntryGid,
    rowNumber: insertRowNumber,
    position,
    order: String(insertOrder),
    title,
    shiftedCount: shiftedRows.length,
    shiftedFromOrder: String(insertOrder),
    updatedAt,
    updatedCells: update.updatedCells
  };
}

async function updateSubjectStatus(sheetUrl, payload, auth = null) {
  const spreadsheetId = extractSpreadsheetId(sheetUrl);
  if (!spreadsheetId) throw new Error("ไม่พบ spreadsheet id");
  const statusType = String(payload.statusType || "").trim();
  const nextStatus = cleanCell(payload.status);
  if (!["clip", "document"].includes(statusType)) throw new Error("ประเภทสถานะไม่ถูกต้อง");
  if (!["ยังไม่ลงลิงก์", "ลงลิงก์แล้ว"].includes(nextStatus)) throw new Error("สถานะต้องเป็น ยังไม่ลงลิงก์ หรือ ลงลิงก์แล้ว เท่านั้น");

  const csvText = await fetchSheetCsv(spreadsheetId, manualEntryGid, auth);
  const rows = parseCsv(csvText);
  const header = rows[0] || [];
  const positionIndex = columnIndex(header, ["ตำแหน่ง"]);
  const orderIndex = columnIndex(header, ["ลำดับ"]);
  const subjectIndex = columnIndex(header, ["ชื่อวิชา/หัวข้อ"]);
  const statusIndex = columnIndex(header, clipLinkStatusHeaders);
  const documentStatusIndex = columnIndex(header, documentStatusHeaders);
  let latestUpdateIndex = columnIndex(header, latestUpdateHeaders);
  let latestUpdateItemIndex = columnIndex(header, latestUpdateItemHeaders);
  let updateHistoryIndex = columnIndex(header, updateHistoryHeaders);
  const targetColumnIndex = statusType === "clip" ? statusIndex : documentStatusIndex;
  if (positionIndex < 0 || orderIndex < 0 || subjectIndex < 0) {
    throw new Error("ไม่พบคอลัมน์ตำแหน่ง/ลำดับ/ชื่อวิชาในชีต");
  }
  if (targetColumnIndex < 0) {
    throw new Error(statusType === "clip" ? "ไม่พบคอลัมน์สถานะลิงก์คลิปในชีต" : "ไม่พบคอลัมน์สถานะเอกสารในชีต");
  }

  const position = cleanCell(payload.position);
  const order = cleanCell(payload.order);
  const title = cleanCell(payload.title);
  if (!position || !order || !title) throw new Error("ข้อมูลตำแหน่ง/ลำดับ/ชื่อวิชาไม่ครบ");

  const matches = rows.slice(1)
    .map((row, index) => ({ row, rowNumber: index + 2 }))
    .filter(({ row }) =>
      sameSheetKey(row[positionIndex], position) &&
      sameSheetKey(row[orderIndex], order) &&
      sameSheetKey(row[subjectIndex], title)
    );

  if (matches.length !== 1) {
    throw new Error(matches.length === 0
      ? "ไม่พบแถวที่ตรงกับตำแหน่ง/ลำดับ/ชื่อวิชานี้ จึงยังไม่เขียนชีต"
      : `พบ ${matches.length} แถวที่ตรงกัน จึงยังไม่เขียนเพื่อกันแก้ผิดแถว`);
  }

  const sheetName = await fetchSheetTitleByGid(spreadsheetId, manualEntryGid, auth);
  const match = matches[0];
  const previousStatus = cleanCell(match.row[targetColumnIndex]);
  if (latestUpdateIndex < 0) {
    latestUpdateIndex = header.length;
    await updateGoogleSheetCell(spreadsheetId, sheetName, 1, latestUpdateIndex, "อัปเดตล่าสุด", auth);
    header.push("อัปเดตล่าสุด");
  }
  if (latestUpdateItemIndex < 0) {
    latestUpdateItemIndex = header.length;
    await updateGoogleSheetCell(spreadsheetId, sheetName, 1, latestUpdateItemIndex, "รายการอัปเดตล่าสุด", auth);
    header.push("รายการอัปเดตล่าสุด");
  }
  if (updateHistoryIndex < 0) {
    updateHistoryIndex = header.length;
    await updateGoogleSheetCell(spreadsheetId, sheetName, 1, updateHistoryIndex, "ประวัติอัปเดต", auth);
    header.push("ประวัติอัปเดต");
  }
  const update = await updateGoogleSheetCell(spreadsheetId, sheetName, match.rowNumber, targetColumnIndex, nextStatus, auth);
  const updatedAt = new Date().toISOString();
  const latestUpdateItem = `${statusType === "clip" ? "ลิงก์คลิป" : "ลิงก์เอกสาร"}: ${nextStatus} · ${title}`;
  const historyEntry = { at: updatedAt, type: statusType, status: nextStatus, title };
  const updateHistory = buildUpdateHistoryValue(match.row[updateHistoryIndex], historyEntry);
  let updatedCells = update.updatedCells || 0;
  const latestUpdateResult = await updateGoogleSheetCell(spreadsheetId, sheetName, match.rowNumber, latestUpdateIndex, updatedAt, auth);
  updatedCells += latestUpdateResult.updatedCells || 0;
  const latestItemResult = await updateGoogleSheetCell(spreadsheetId, sheetName, match.rowNumber, latestUpdateItemIndex, latestUpdateItem, auth);
  updatedCells += latestItemResult.updatedCells || 0;
  const historyResult = await updateGoogleSheetCell(spreadsheetId, sheetName, match.rowNumber, updateHistoryIndex, updateHistory, auth);
  updatedCells += historyResult.updatedCells || 0;
  return {
    spreadsheetId,
    gid: manualEntryGid,
    rowNumber: match.rowNumber,
    columnIndex: targetColumnIndex,
    statusType,
    previousStatus,
    status: nextStatus,
    updatedAt,
    latestUpdateItem,
    updateHistory,
    ...update
    ,
    updatedCells
  };
}

async function updateSubjectStatusViaAppsScript(sheetUrl, payload, writer) {
  if (!writer?.url) throw new Error("Apps Script status writer is not configured");
  const response = await fetch(writer.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      sheetUrl,
      secret: writer.secret || ""
    })
  });
  const text = await response.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Apps Script did not return JSON (${response.status})`);
  }
  if (!response.ok || json.ok === false) {
    throw new Error(json.error || `Apps Script write failed (${response.status})`);
  }
  csvCache.clear();
  return {
    source: "appsScript",
    ...json
  };
}

async function fetchSheetCsv(spreadsheetId, gid, auth = null) {
  const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
  const publicCsv = await fetchPublicCsv(csvUrl);
  if (publicCsv.ok) return publicCsv.text;
  if (auth?.accessToken) {
    const sheetName = await fetchSheetTitleByGid(spreadsheetId, gid, auth);
    return fetchPrivateSheetCsvByName(spreadsheetId, sheetName, auth);
  }
  if (publicCsv.status === 401 || publicCsv.status === 403 || publicCsv.contentType.includes("text/html")) {
    throw new Error("ชีตนี้เป็น private กรุณาตั้งค่า Service Account ให้แอพอ่านชีต หรือเข้าสู่ระบบ Google ด้วยอีเมลที่ได้รับอนุญาต");
  }
  throw new Error(`โหลด CSV จาก Google Sheet ไม่สำเร็จ (${publicCsv.status})`);
}

async function fetchSheetCsvByName(spreadsheetId, sheetName, auth = null) {
  const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const publicCsv = await fetchPublicCsv(csvUrl);
  if (publicCsv.ok) return publicCsv.text;
  if (auth?.accessToken) return fetchPrivateSheetCsvByName(spreadsheetId, sheetName, auth);
  if (publicCsv.status === 401 || publicCsv.status === 403 || publicCsv.contentType.includes("text/html")) {
    throw new Error("ชีตนี้เป็น private กรุณาตั้งค่า Service Account ให้แอพอ่านชีต หรือเข้าสู่ระบบ Google ด้วยอีเมลที่ได้รับอนุญาต");
  }
  throw new Error(`โหลด CSV จาก Google Sheet ไม่สำเร็จ (${publicCsv.status})`);
}

async function loadManualRows(spreadsheetId, auth = null) {
  const csvText = await fetchSheetCsv(spreadsheetId, manualEntryGid, auth);
  const rows = parseCsv(csvText);
  const header = rows[0] || [];
  const positionIndex = columnIndex(header, ["ตำแหน่ง"]);
  const groupIndex = columnIndex(header, ["กลุ่ม"]);
  const orderIndex = columnIndex(header, ["ลำดับ"]);
  const subjectIndex = columnIndex(header, ["ชื่อวิชา/หัวข้อ"]);
  const statusIndex = columnIndex(header, clipLinkStatusHeaders);
  const documentStatusIndex = columnIndex(header, documentStatusHeaders);
  const latestUpdateIndex = columnIndex(header, latestUpdateHeaders);
  const latestUpdateItemIndex = columnIndex(header, latestUpdateItemHeaders);
  const updateHistoryIndex = columnIndex(header, updateHistoryHeaders);
  const reusableIndex = columnIndex(header, ["ใช้สอนได้หลายกลุ่ม"]);
  const linkIndex = columnIndex(header, ["ลิงก์โพสต์/กลุ่ม", "ลิงก์กลุ่ม", "Facebook"]);
  const noteIndex = columnIndex(header, ["หมายเหตุ"]);
  const clipStatusIndex = columnIndex(header, ["ลงคลิป"]);

  if (positionIndex < 0 || subjectIndex < 0) {
    throw new Error("ไม่พบคอลัมน์ตำแหน่งหรือชื่อวิชา/หัวข้อในชีต");
  }

  return rows.slice(1)
    .filter(row => cleanCell(row[positionIndex]) && cleanCell(row[subjectIndex]))
    .map((row, index) => ({
      rowNumber: index + 2,
      position: cleanCell(row[positionIndex]),
      group: cleanCell(row[groupIndex]),
      order: cleanCell(row[orderIndex]) || String(index + 1),
      title: cleanCell(row[subjectIndex]),
      sheetStatus: cleanCell(row[statusIndex]),
      documentStatus: cleanCell(row[documentStatusIndex]),
      reusable: cleanCell(row[reusableIndex]),
      link: cleanCell(row[linkIndex]),
      note: cleanCell(row[noteIndex]),
      clipStatus: cleanCell(row[clipStatusIndex]),
      latestUpdate: cleanCell(row[latestUpdateIndex]),
      latestUpdateItem: cleanCell(row[latestUpdateItemIndex]),
      updateHistory: cleanCell(row[updateHistoryIndex])
    }));
}

function buildGroupLinkMaps(manualRows) {
  const byPosition = new Map();
  const byGroup = new Map();
  for (const row of manualRows) {
    if (!isUrl(row.link)) continue;
    if (row.position && !byPosition.has(row.position)) byPosition.set(row.position, row.link);
    const groupKey = normalizeGroupKey(row.group);
    if (groupKey && !byGroup.has(groupKey)) byGroup.set(groupKey, row.link);
  }
  return { byPosition, byGroup };
}

function buildLatestUpdateMap(manualRows) {
  const byPosition = new Map();
  for (const row of manualRows) {
    const updatedAt = cleanCell(row.latestUpdate);
    const history = parseUpdateHistoryEntries(row.updateHistory);
    if (updatedAt && !history.length) {
      history.unshift({
        at: updatedAt,
        type: "",
        status: "",
        title: cleanCell(row.latestUpdateItem) || row.title || ""
      });
    }
    if (!row.position || !history.length) continue;
    const existing = byPosition.get(row.position) || { history: [] };
    existing.history.push(...history);
    byPosition.set(row.position, existing);
  }
  for (const [position, value] of byPosition.entries()) {
    const history = value.history
      .map(entry => ({ ...entry, timestamp: Date.parse(entry.at || "") }))
      .filter(entry => Number.isFinite(entry.timestamp) || entry.title || entry.status)
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, 5);
    const latest = history[0] || {};
    byPosition.set(position, {
      updatedAt: latest.at || "",
      timestamp: latest.timestamp || 0,
      item: latest.title || "",
      history
    });
  }
  return byPosition;
}

async function loadDashboard(sheetUrl, auth = null) {
  const spreadsheetId = extractSpreadsheetId(sheetUrl);
  if (!spreadsheetId) throw new Error("ไม่พบ spreadsheet id");

  const [dashboardCsv, manualRows] = await Promise.all([
    fetchSheetCsv(spreadsheetId, dashboardGid, auth),
    loadManualRows(spreadsheetId, auth)
  ]);
  const groupLinks = buildGroupLinkMaps(manualRows);
  const latestUpdates = buildLatestUpdateMap(manualRows);
  const rows = parseCsv(dashboardCsv);
  const headerIndex = findHeaderIndex(rows, ["ตำแหน่ง", "วิชาทั้งหมด", "% สำเร็จ"]);
  if (headerIndex < 0) throw new Error("ไม่พบตารางสรุปตามตำแหน่งใน Dashboard");

  const header = rows[headerIndex] || [];
  const positionIndex = columnIndex(header, ["ตำแหน่ง"]);
  const totalIndex = columnIndex(header, ["วิชาทั้งหมด", "ทั้งหมด"]);
  const doneIndex = columnIndex(header, ["ลงลิงก์แล้ว"]);
  const missingIndex = columnIndex(header, ["ยังไม่ลงลิงก์"]);
  const percentIndex = columnIndex(header, ["% สำเร็จ"]);
  const groupLinkIndex = columnIndex(header, ["ลิงก์กลุ่ม", "กลุ่ม"]);
  const closedCourseIndex = columnIndex(header, ["ปิดคอร์ส"]);

  const positions = rows.slice(headerIndex + 1)
    .filter(row => cleanCell(row[positionIndex]) && cleanCell(row[positionIndex]) !== "ตำแหน่ง")
    .map(row => {
      const name = cleanCell(row[positionIndex]);
      const groupLabel = cleanCell(row[groupLinkIndex]);
      const groupKey = normalizeGroupKey(groupLabel);
      const latestUpdate = latestUpdates.get(name) || {};
      const facebookUrl =
        (isUrl(groupLabel) ? groupLabel : "") ||
        groupLinks.byPosition.get(name) ||
        groupLinks.byGroup.get(groupKey) ||
        "";
      return {
        name,
        total: cleanCell(row[totalIndex]),
        done: cleanCell(row[doneIndex]),
        missing: cleanCell(row[missingIndex]),
        percent: cleanCell(row[percentIndex]),
        groupLabel,
        facebookUrl,
        latestUpdate: latestUpdate.updatedAt || "",
        latestUpdateItem: latestUpdate.item || "",
        updateHistory: latestUpdate.history || [],
        closedCourse: cleanCell(row[closedCourseIndex]) || "FALSE"
      };
    })
    .filter(position => position.name && position.name !== "#DIV/0!");

  const totals = positions.reduce((summary, position) => {
    summary.total += parseCount(position.total);
    summary.done += parseCount(position.done);
    summary.missing += parseCount(position.missing);
    summary.closed += /^true$/i.test(position.closedCourse) ? 1 : 0;
    return summary;
  }, { total: 0, done: 0, missing: 0, closed: 0 });
  totals.percent = totals.total ? `${Math.round((totals.done / totals.total) * 100)}%` : "-";

  return {
    spreadsheetId,
    gid: dashboardGid,
    count: positions.length,
    totals,
    positions
  };
}

async function loadDocumentLibrary(sheetUrl, gid = "", sheetName = "สารบัญเอกสาร", auth = null) {
  const spreadsheetId = extractSpreadsheetId(sheetUrl);
  if (!spreadsheetId) throw new Error("ไม่พบ spreadsheet id");
  const csvText = sheetName
    ? await fetchSheetCsvByName(spreadsheetId, sheetName, auth)
    : await fetchSheetCsv(spreadsheetId, gid || extractSheetGid(sheetUrl, "0"), auth);
  const rows = parseCsv(csvText);
  const headerIndex = rows.findIndex(row => cleanCell(row[0]) === "ชื่อไฟล์");
  if (headerIndex < 0) throw new Error(`ไม่พบหัวตารางชื่อไฟล์ในแผ่น ${sheetName || "ที่เลือก"}`);
  const headers = rows[headerIndex].map((cell, index) => cleanCell(cell) || `คอลัมน์ ${index + 1}`);
  const nameIndex = columnIndex(headers, ["ชื่อไฟล์"]);
  const categoryIndex = columnIndex(headers, ["หมวดหลัก"]);
  const folderIndex = columnIndex(headers, ["โฟลเดอร์ย่อยบน Drive"]);
  const extensionIndex = columnIndex(headers, ["นามสกุล"]);
  const sizeIndex = columnIndex(headers, ["ขนาด MB"]);
  const modifiedIndex = columnIndex(headers, ["แก้ไขล่าสุด"]);
  const idIndex = columnIndex(headers, ["Drive File ID"]);
  const urlIndex = columnIndex(headers, ["Drive URL"]);
  const mimeIndex = columnIndex(headers, ["MIME Type"]);
  const statusIndex = columnIndex(headers, ["สถานะ"]);

  const items = rows.slice(headerIndex + 1)
    .filter(row => cleanCell(row[nameIndex]))
    .map((row, index) => {
      const cells = headers.map((_, cellIndex) => cleanCell(row[cellIndex]));
      const values = {};
      headers.forEach((header, cellIndex) => {
        values[header] = cells[cellIndex] || "";
      });
      return {
        rowNumber: headerIndex + index + 2,
        name: cleanCell(row[nameIndex]),
        category: cleanCell(row[categoryIndex]),
        folder: cleanCell(row[folderIndex]),
        extension: cleanCell(row[extensionIndex]),
        sizeMb: cleanCell(row[sizeIndex]),
        modifiedAt: cleanCell(row[modifiedIndex]),
        driveFileId: cleanCell(row[idIndex]),
        url: cleanCell(row[urlIndex]),
        mimeType: cleanCell(row[mimeIndex]),
        status: cleanCell(row[statusIndex]),
        cells,
        values
      };
    });

  const categories = [...new Set(items.map(item => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "th"));
  const pdfCount = items.filter(item => item.extension.toLowerCase() === ".pdf").length;
  const totalSize = items.reduce((sum, item) => sum + (Number(item.sizeMb) || 0), 0);
  const summary = {
    title: sheetName,
    totalFiles: String(items.length),
    pdfFiles: String(pdfCount),
    totalSizeMb: totalSize ? totalSize.toFixed(2) : "",
    categoryCount: String(categories.length),
    updatedAt: items.map(item => item.modifiedAt).filter(Boolean).sort().at(-1) || "",
    status: "โหลดจากแผ่นสารบัญเอกสาร"
  };

  return {
    spreadsheetId,
    gid: gid || "",
    sheetName,
    title: sheetName,
    summary,
    categories: categories.map(name => ({ name, count: items.filter(item => item.category === name).length })),
    fileTypes: [],
    importantLinks: [
      { label: "เปิดชีตคลังเอกสาร", url: sheetUrl }
    ],
    headers,
    count: items.length,
    rows: items
  };
}

async function loadPositions(sheetUrl, auth = null) {
  return loadDashboard(sheetUrl, auth);
}

async function loadSubjects(sheetUrl, positionName, auth = null) {
  const spreadsheetId = extractSpreadsheetId(sheetUrl);
  if (!spreadsheetId) throw new Error("ไม่พบ spreadsheet id");
  if (!positionName) throw new Error("กรุณาเลือกตำแหน่ง");

  const csvText = await fetchSheetCsv(spreadsheetId, manualEntryGid, auth);
  const rows = parseCsv(csvText);
  const header = rows[0] || [];
  const positionIndex = header.indexOf("ตำแหน่ง");
  const groupIndex = header.indexOf("กลุ่ม");
  const orderIndex = header.indexOf("ลำดับ");
  const subjectIndex = header.indexOf("ชื่อวิชา/หัวข้อ");
  const statusIndex = columnIndex(header, clipLinkStatusHeaders);
  const documentStatusIndex = columnIndex(header, documentStatusHeaders);
  const reusableIndex = header.indexOf("ใช้สอนได้หลายกลุ่ม");
  const noteIndex = header.indexOf("หมายเหตุ");
  const clipStatusIndex = header.indexOf("ลงคลิป");

  if (positionIndex < 0 || subjectIndex < 0) {
    throw new Error("ไม่พบคอลัมน์ตำแหน่งหรือชื่อวิชา/หัวข้อในชีต");
  }

  const allPositions = positionName === "__ALL__";
  const subjects = rows.slice(1)
    .filter(row => allPositions || (row[positionIndex] || "").trim() === positionName)
    .filter(row => (row[subjectIndex] || "").trim())
    .map((row, index) => ({
      rowNumber: index + 2,
      position: (row[positionIndex] || "").trim(),
      group: row[groupIndex] || "",
      order: allPositions ? String(index + 1) : row[orderIndex] || String(index + 1),
      title: (row[subjectIndex] || "").trim(),
      sheetStatus: row[statusIndex] || "",
      documentStatus: row[documentStatusIndex] || "",
      reusable: row[reusableIndex] || "",
      note: row[noteIndex] || "",
      clipStatus: row[clipStatusIndex] || ""
    }));

  return {
    spreadsheetId,
    gid: manualEntryGid,
    position: allPositions ? "ตำแหน่งทั้งหมด" : positionName,
    allPositions,
    count: subjects.length,
    subjects
  };
}

function statusKind(value) {
  const text = cleanCell(value);
  if (!text) return "pending";
  if (/^(true|yes|done|complete)$/i.test(text)) return "done";
  if (/ยัง|ไม่|pending|todo|รอ|ต้อง/i.test(text)) return "pending";
  if (/ลง.*แล้ว|เรียบร้อย|done|complete/i.test(text)) return "done";
  return "review";
}

function clipFlagKind(value) {
  const text = cleanCell(value);
  if (!text) return "";
  if (/ลง.*คลิป.*แล้ว|ลงคลิปแล้ว|done|complete/i.test(text)) return "done";
  if (/ยัง|ไม่|รอ|ต้อง/i.test(text)) return "pending";
  return "review";
}

function compactTaskKey(...parts) {
  return parts.map(part => cleanCell(part).replace(/\s+/g, " ").toLowerCase()).join("|");
}

function normalizeBotText(value) {
  return String(value || "")
    .replace(/@\w+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeNoSpace(value) {
  return normalizeBotText(value).replace(/\s+/g, "");
}

// ใช้จับคู่ชื่อกลุ่ม/ตำแหน่งแบบยืดหยุ่น: ตัดวรรค จุด ขีด วงเล็บ และเครื่องหมายอื่น
// เพื่อให้ "กกตการเงิน" จับกับ "กกต. การเงิน" ได้
function normalizeMatchKey(value) {
  return normalizeBotText(value).replace(/[\s.\-_,/()"'`]+/g, "");
}

// ความยาว substring ร่วมที่ยาวสุด ใช้จับคู่ชื่อวิชาภาษาไทยที่พิมพ์ติดกันไม่มีวรรค
function longestCommonSubstringLen(a, b) {
  if (!a || !b) return 0;
  const m = a.length, n = b.length;
  let prev = new Array(n + 1).fill(0);
  let best = 0;
  for (let i = 1; i <= m; i++) {
    const cur = new Array(n + 1).fill(0);
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        cur[j] = prev[j - 1] + 1;
        if (cur[j] > best) best = cur[j];
      }
    }
    prev = cur;
  }
  return best;
}

function priorityRank(priority) {
  return { urgent: 0, high: 1, normal: 2, low: 3 }[priority] ?? 4;
}

function taskIdFromParts(...parts) {
  return Buffer.from(compactTaskKey(...parts)).toString("base64url").slice(0, 28);
}

function csvRowsToObjects(csvText) {
  const rows = parseCsv(csvText);
  const headers = (rows[0] || []).map(cleanCell);
  return rows.slice(1)
    .filter(row => row.some(cell => cleanCell(cell)))
    .map(row => {
      const item = {};
      headers.forEach((header, index) => {
        item[header || `column${index + 1}`] = cleanCell(row[index]);
      });
      return item;
    });
}

async function findLatestLocalFile(pattern) {
  const candidates = [];
  const seen = new Set();
  for (const baseDir of localDataRoots) {
    let entries = [];
    try {
      entries = await readdir(baseDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !pattern.test(entry.name)) continue;
      const filePath = join(baseDir, entry.name);
      const key = normalizeRoot(filePath).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        const stats = await stat(filePath);
        candidates.push({ path: filePath, name: entry.name, modifiedMs: stats.mtimeMs, sizeBytes: stats.size });
      } catch {}
    }
  }
  candidates.sort((a, b) => b.modifiedMs - a.modifiedMs || b.name.localeCompare(a.name));
  return candidates[0] || null;
}

async function readLatestLocalTaskAudit() {
  const result = {
    available: false,
    sources: [],
    summary: {},
    groupRows: [],
    pendingRows: [],
    warnings: []
  };

  const auditFile = await findLatestLocalFile(/^sunwu_sarabun_audit_\d{4}-\d{2}-\d{2}\.json$/i);
  if (auditFile) {
    try {
      const json = JSON.parse(await readFile(auditFile.path, "utf8"));
      result.available = true;
      result.audit = json;
      result.summary = json.summary || {};
      result.sources.push({ type: "local-audit-json", name: auditFile.name, path: auditFile.path, updatedAt: json.auditedAt || "" });
    } catch (error) {
      result.warnings.push(`อ่าน audit JSON ไม่สำเร็จ: ${error.message}`);
    }
  }

  const groupFile = await findLatestLocalFile(/^sunwu_sarabun_group_summary_\d{4}-\d{2}-\d{2}\.csv$/i);
  if (groupFile) {
    try {
      result.available = true;
      result.groupRows = csvRowsToObjects(await readFile(groupFile.path, "utf8"));
      result.sources.push({ type: "local-group-summary-csv", name: groupFile.name, path: groupFile.path, rowCount: result.groupRows.length });
    } catch (error) {
      result.warnings.push(`อ่าน group summary CSV ไม่สำเร็จ: ${error.message}`);
    }
  }

  const pendingFile = await findLatestLocalFile(/^sunwu_sarabun_pending_with_clip_audit_\d{4}-\d{2}-\d{2}\.csv$/i);
  if (pendingFile) {
    try {
      result.available = true;
      result.pendingRows = csvRowsToObjects(await readFile(pendingFile.path, "utf8"));
      result.sources.push({ type: "local-pending-clip-csv", name: pendingFile.name, path: pendingFile.path, rowCount: result.pendingRows.length });
    } catch (error) {
      result.warnings.push(`อ่าน pending audit CSV ไม่สำเร็จ: ${error.message}`);
    }
  }

  return result;
}

function localPendingRowKey(row) {
  return compactTaskKey(row["ตำแหน่ง"], row["ลำดับ"], row["ชื่อวิชา/หัวข้อ"]);
}

function manualRowKey(row) {
  return compactTaskKey(row.position, row.order, row.title);
}

function makeTask({ type, priority = "normal", position = "", group = "", order = "", title = "", detail = "", action = "", url = "", source = "sheet", score = "", matchLevel = "", updatedAt = "" }) {
  return {
    id: taskIdFromParts(type, position, order, title, source),
    type,
    priority,
    position,
    group,
    order,
    title,
    detail,
    action,
    url,
    source,
    score,
    matchLevel,
    updatedAt
  };
}

async function loadTaskMonitor(sheetUrl, auth = null, options = {}) {
  const generatedAt = new Date().toISOString();
  const warnings = [];
  const sources = [];
  const telegram = publicTelegramConfig(await getTelegramConfig());
  const line = publicLineConfig(await getLineConfig());

  let dashboard = null;
  let manualRows = [];
  let scanIndex = { files: [] };
  let localAudit = { available: false, sources: [], summary: {}, groupRows: [], pendingRows: [], warnings: [] };

  try {
    dashboard = await loadDashboard(sheetUrl, auth);
    sources.push({ type: "google-dashboard", spreadsheetId: dashboard.spreadsheetId, gid: dashboard.gid, count: dashboard.count });
  } catch (error) {
    warnings.push(`โหลด Dashboard ไม่สำเร็จ: ${error.message}`);
  }

  try {
    const spreadsheetId = extractSpreadsheetId(sheetUrl);
    manualRows = await loadManualRows(spreadsheetId, auth);
    sources.push({ type: "google-manual-rows", spreadsheetId, gid: manualEntryGid, count: manualRows.length });
  } catch (error) {
    warnings.push(`โหลดรายวิชาจากชีตไม่สำเร็จ: ${error.message}`);
  }

  try {
    scanIndex = await readJson(indexPath, { files: [] });
    if (scanIndex.scannedAt || scanIndex.files?.length) {
      sources.push({ type: "local-scan-index", sourceRoot: scanIndex.sourceRoot || "", scannedAt: scanIndex.scannedAt || "", totalVideos: (scanIndex.files || []).length });
    }
  } catch (error) {
    warnings.push(`อ่าน scan index ไม่สำเร็จ: ${error.message}`);
  }

  if (options.includeLocalAudit !== false) {
    localAudit = await readLatestLocalTaskAudit();
    warnings.push(...localAudit.warnings);
    sources.push(...localAudit.sources);
  }

  const dashboardPositions = dashboard?.positions || [];
  const closedPositionNames = new Set(dashboardPositions
    .filter(position => String(position.closedCourse || "").toLowerCase() === "true")
    .map(position => position.name));
  const manualRowsWithPosition = manualRows.filter(row => row.position);
  const openManualRows = manualRowsWithPosition.filter(row => !closedPositionNames.has(row.position));
  const pendingClipRows = openManualRows.filter(row => statusKind(row.sheetStatus) !== "done");
  const pendingDocumentRows = openManualRows.filter(row => statusKind(row.documentStatus) !== "done");

  const pendingAuditByKey = new Map();
  for (const row of localAudit.pendingRows || []) {
    pendingAuditByKey.set(localPendingRowKey(row), row);
  }

  const tasks = [];
  for (const row of pendingClipRows) {
    const auditRow = pendingAuditByKey.get(manualRowKey(row));
    const hasClip = cleanCell(auditRow?.["มีคลิปในเครื่อง?"]) === "มี";
    const matchLevel = auditRow?.["ระดับการจับคู่"] || "";
    const score = auditRow?.["คะแนน"] || "";
    const scoreNumber = Number(score || 0);
    const flagDone = clipFlagKind(row.clipStatus) === "done";
    const priority = flagDone || (hasClip && scoreNumber >= 80) ? "urgent" : hasClip ? "high" : "normal";
    const type = hasClip || flagDone ? "clip-ready" : "clip-missing";
    const detail = hasClip
      ? `พบคลิปในเครื่อง${matchLevel ? ` (${matchLevel}${score ? ` ${score}%` : ""})` : ""}`
      : flagDone ? "คอลัมน์ลงคลิปบอกว่าลงคลิปแล้ว แต่สถานะลิงก์ยังค้าง" : "ยังไม่พบคลิปจาก audit ล่าสุด";
    tasks.push(makeTask({
      type,
      priority,
      position: row.position,
      group: row.group,
      order: row.order,
      title: row.title,
      detail,
      action: type === "clip-ready" ? "ลงลิงก์คลิป/โพสต์ในกลุ่ม" : "หาหรือจัดทำคลิป",
      url: row.link,
      source: auditRow ? "local-audit+sheet" : "sheet",
      score,
      matchLevel,
      updatedAt: auditRow?.["อัปเดตล่าสุด"] || ""
    }));
  }

  for (const row of pendingDocumentRows) {
    tasks.push(makeTask({
      type: "document-missing",
      priority: statusKind(row.sheetStatus) === "done" ? "high" : "normal",
      position: row.position,
      group: row.group,
      order: row.order,
      title: row.title,
      detail: "สถานะเอกสารยังไม่ครบ",
      action: "เติม/ตรวจลิงก์เอกสาร",
      url: row.link,
      source: "sheet"
    }));
  }

  for (const position of dashboardPositions) {
    const missing = parseCount(position.missing);
    const percent = parseCount(position.percent);
    const closed = String(position.closedCourse || "").toLowerCase() === "true";
    if (closed || !missing) continue;
    if (percent < 50 || missing >= 10) {
      tasks.push(makeTask({
        type: "position-review",
        priority: percent < 30 || missing >= 15 ? "high" : "normal",
        position: position.name,
        group: position.groupLabel,
        title: position.name,
        detail: `ค้าง ${missing.toLocaleString("th-TH")} วิชา, สำเร็จ ${position.percent || "0%"}`,
        action: "ตรวจตำแหน่งนี้ก่อน",
        url: position.facebookUrl,
        source: "dashboard"
      }));
    }
  }

  const openPositions = dashboardPositions.filter(position => String(position.closedCourse || "").toLowerCase() !== "true");
  const pendingWithClip = tasks.filter(task => task.type === "clip-ready").length;
  const localSummary = localAudit.summary || {};
  const summary = {
    positions: dashboard?.count || dashboardPositions.length,
    openPositions: localSummary.openPositions ?? openPositions.length,
    closedPositions: localSummary.closedPositions ?? closedPositionNames.size,
    subjects: localSummary.openSubjects ?? openManualRows.length,
    linkedSubjects: localSummary.linkedSubjects ?? openManualRows.filter(row => statusKind(row.sheetStatus) === "done").length,
    pendingSubjects: localSummary.pendingSubjects ?? pendingClipRows.length,
    pendingWithClip: localSummary.pendingWithAnyClip ?? pendingWithClip,
    pendingStrong: localSummary.pendingStrong ?? tasks.filter(task => task.type === "clip-ready" && Number(task.score || 0) >= 90).length,
    pendingNeedsReview: localSummary.pendingNeedsReview ?? tasks.filter(task => task.type === "clip-ready" && Number(task.score || 0) < 80).length,
    pendingNoClipFound: localSummary.pendingNoClipFound ?? tasks.filter(task => task.type === "clip-missing").length,
    missingDocuments: pendingDocumentRows.length,
    urgentTasks: tasks.filter(task => task.priority === "urgent").length,
    highTasks: tasks.filter(task => task.priority === "high").length,
    scanTotalVideos: (scanIndex.files || []).length || localAudit.audit?.scanIndex?.totalVideos || 0,
    scanScannedAt: scanIndex.scannedAt || localAudit.audit?.scanIndex?.scannedAt || "",
    localAuditAvailable: Boolean(localAudit.available)
  };

  const groupSummaryByPosition = new Map((localAudit.groupRows || []).map(row => [row["ตำแหน่ง"], row]));
  const positions = dashboardPositions.map(position => {
    const groupSummary = groupSummaryByPosition.get(position.name) || {};
    return {
      ...position,
      missingCount: parseCount(position.missing),
      percentNumber: parseCount(position.percent),
      pendingWithClip: parseCount(groupSummary["ต้องตรวจที่มีคลิปในเครื่อง"]),
      pendingStrong: parseCount(groupSummary["ตรงมาก"]),
      pendingNeedsReview: parseCount(groupSummary["ต้องตรวจคลิป"]),
      latestItem: groupSummary["รายการล่าสุด"] || "",
      updatedAt: groupSummary["อัปเดตล่าสุด"] || ""
    };
  }).sort((a, b) =>
    (b.pendingWithClip - a.pendingWithClip) ||
    (b.missingCount - a.missingCount) ||
    (a.percentNumber - b.percentNumber) ||
    String(a.name).localeCompare(String(b.name), "th")
  );

  tasks.sort((a, b) =>
    priorityRank(a.priority) - priorityRank(b.priority) ||
    Number(b.score || 0) - Number(a.score || 0) ||
    String(a.position).localeCompare(String(b.position), "th") ||
    String(a.order).localeCompare(String(b.order), "th", { numeric: true })
  );

  const subjects = manualRowsWithPosition.map(row => {
    const auditRow = pendingAuditByKey.get(manualRowKey(row));
    const clipDone = statusKind(row.sheetStatus) === "done";
    const documentDone = statusKind(row.documentStatus) === "done";
    const hasClip = Boolean(auditRow) || clipFlagKind(row.clipStatus) === "done";
    return {
      rowNumber: row.rowNumber,
      position: row.position,
      group: row.group,
      order: row.order,
      title: row.title,
      clipStatus: row.sheetStatus || "",
      clipStatusKind: clipDone ? "done" : statusKind(row.sheetStatus),
      documentStatus: row.documentStatus || "",
      documentStatusKind: documentDone ? "done" : statusKind(row.documentStatus),
      reusable: row.reusable,
      link: row.link,
      note: row.note,
      latestUpdate: row.latestUpdate || "",
      latestUpdateItem: row.latestUpdateItem || "",
      updateHistory: parseUpdateHistoryEntries(row.updateHistory),
      closedCourse: closedPositionNames.has(row.position) ? "TRUE" : "FALSE",
      hasClip,
      clipEvidence: hasClip ? "พบคลิป/มีข้อมูลคลิปในระบบ" : "ยังไม่พบคลิปจาก audit ล่าสุด",
      needsClipLink: !clipDone,
      needsDocument: !documentDone
    };
  });

  return {
    generatedAt,
    ok: true,
    sheetUrl,
    summary,
    positions,
    subjects,
    tasks,
    sources,
    warnings,
    telegram,
    line
  };
}

function formatThaiDateTimeText(value = new Date(), timeZone = "Asia/Bangkok") {
  try {
    return new Intl.DateTimeFormat("th-TH", {
      timeZone,
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  } catch {
    return new Date(value).toISOString();
  }
}

function formatTaskLine(task, index = 0) {
  const prefix = index ? `${index}. ` : "";
  const score = task.score ? ` (${task.matchLevel || "คะแนน"} ${task.score}%)` : "";
  const order = task.order ? ` ลำดับ ${task.order}` : "";
  return `${prefix}${task.position}${order}: ${task.title}`;
}

function buildTelegramSummaryMessage(monitor, options = {}) {
  const summary = monitor.summary || {};
  const timeZone = options.timeZone || "Asia/Bangkok";
  const topPositions = (monitor.positions || []).filter(position => position.missingCount).slice(0, 5);
  const topTasks = (monitor.tasks || []).filter(task => ["urgent", "high"].includes(task.priority)).slice(0, 8);
  const lines = [
    "สรุปงานซุนวู",
    `อัปเดต: ${formatThaiDateTimeText(monitor.generatedAt, timeZone)}`,
    "",
    `ตำแหน่งเปิด: ${summary.openPositions || 0}`,
    `วิชาค้างลงลิงก์คลิป: ${summary.pendingSubjects || 0}`,
    `ค้างแต่พบคลิปแล้ว: ${summary.pendingWithClip || 0}`,
    `ยังไม่พบคลิป: ${summary.pendingNoClipFound || 0}`,
    `เอกสารยังไม่ครบ: ${summary.missingDocuments || 0}`,
    ""
  ];

  if (topPositions.length) {
    lines.push("ตำแหน่งที่ควรดูแรก:");
    topPositions.forEach((position, index) => {
      lines.push(`${index + 1}. ${position.name} - ค้าง ${position.missingCount} วิชา, มีคลิปรอตรวจ ${position.pendingWithClip || 0}`);
    });
    lines.push("");
  }

  if (topTasks.length) {
    lines.push("งานด่วน:");
    topTasks.forEach((task, index) => lines.push(formatTaskLine(task, index + 1)));
  } else {
    lines.push("ตอนนี้ไม่มีงานด่วนระดับสูงจากข้อมูลล่าสุด");
  }

  lines.push("");
  lines.push("ถามต่อได้ เช่น: สรุปงานค้าง, งานด่วนวันนี้, กกต การเงินเหลืออะไร, วิชาไหนมีคลิปแล้ว");
  return lines.join("\n").slice(0, 3900);
}

function buildTelegramHelpMessage() {
  return [
    "ถามงานซุนวูด้วยภาษาปกติได้เลย",
    "",
    "ตัวอย่าง:",
    "- สรุปงานค้าง",
    "- งานด่วนวันนี้",
    "- กกต การเงินเหลืออะไร",
    "- วิชาไหนมีคลิปแล้วแต่ยังไม่ลงลิงก์",
    "- งานเอกสารค้าง",
    "",
    "ถ้าถามชื่อตำแหน่ง ระบบจะสรุปตำแหน่งนั้นให้ก่อน"
  ].join("\n");
}

function findPositionFromQuestion(text, monitor) {
  const normalized = normalizeMatchKey(text);
  if (!normalized) return null;
  return [...(monitor.positions || [])]
    .sort((a, b) => String(b.name || "").length - String(a.name || "").length)
    .find(position => {
      const name = normalizeMatchKey(position.name);
      const group = normalizeMatchKey(position.groupLabel);
      return (name && name.length >= 2 && normalized.includes(name)) ||
        (group && group.length >= 2 && normalized.includes(group));
    }) || null;
}

function searchTasksByQuestion(text, tasks) {
  const terms = normalizeBotText(text)
    .split(/\s+/)
    .map(term => term.trim())
    .filter(term => term.length >= 2 && !/^(มี|ไหม|อะไร|ยัง|งาน|ค้าง|เหลือ|ตำแหน่ง|วิชา|ลิงก์|ลิงค์|คลิป|เอกสาร)$/.test(term));
  if (!terms.length) return [];
  return tasks.filter(task => {
    const haystack = normalizeBotText(`${task.position} ${task.group} ${task.order} ${task.title} ${task.detail}`);
    return terms.every(term => haystack.includes(term));
  });
}

function daysSinceDate(value) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 86400000));
}

function formatShortThaiDate(value, timeZone = "Asia/Bangkok") {
  if (!value) return "ยังไม่มีข้อมูลล่าสุด";
  return formatThaiDateTimeText(value, timeZone);
}

function formatUpdateAge(value) {
  const days = daysSinceDate(value);
  return days == null ? "ยังไม่มีข้อมูลล่าสุด" : `${days} วัน`;
}

function clipStatusLabel(subject) {
  if (subject.clipStatusKind === "done") return "ลงลิงก์แล้ว";
  if (subject.clipStatusKind === "pending") return "ยังไม่ลงลิงก์";
  return subject.clipStatus || "ยังไม่มีสถานะ";
}

function documentStatusLabel(subject) {
  if (subject.documentStatusKind === "done") return "เอกสารครบ/ลงแล้ว";
  if (subject.documentStatusKind === "pending") return "เอกสารยังไม่ครบ";
  return subject.documentStatus || "ยังไม่มีสถานะเอกสาร";
}

function formatSubjectStatusLine(subject, index = 0, options = {}) {
  const prefix = index ? `${index}. ` : "";
  const order = subject.order ? ` ลำดับ ${subject.order}` : "";
  const latest = subject.latestUpdate ? ` | ล่าสุด ${formatShortThaiDate(subject.latestUpdate)} (${formatUpdateAge(subject.latestUpdate)})` : "";
  const clipInfo = options.includeClip ? ` | คลิปในระบบ: ${subject.hasClip ? "พบ" : "ยังไม่พบ"}` : "";
  const closedInfo = String(subject.closedCourse || "").toLowerCase() === "true" ? " | คอร์ส: ปิดแล้ว" : "";
  return `${prefix}${subject.position}${order}: ${subject.title}\n   คลิป: ${clipStatusLabel(subject)} | เอกสาร: ${documentStatusLabel(subject)}${latest}${clipInfo}${closedInfo}`;
}

function questionTerms(text) {
  const stopWords = new Set([
    "วิชา", "วิชานี้", "กลุ่ม", "กลุ่มไหน", "กลุ่มอะไร", "ไหน", "อะไร", "บ้าง",
    "ลง", "ลงไป", "ลงไปยัง", "ลงยัง", "ยัง", "หรือยัง", "แล้ว", "ยังไม่",
    "ลิงก์", "ลิงค์", "link", "โพสต์", "ต้อง", "ต้องลง", "อยู่", "อยู่ใน",
    "มี", "มั้ย", "ไหม", "คลิป", "เอกสาร", "ล่าสุด", "วัน", "กี่วัน",
    "อัปเดต", "อัพเดต", "ขาด", "การ", "เช็ค", "เช็ก", "ดู", "บอก",
    "พระราชบัญญัติ", "พระราชกำหนด", "พระราชกฤษฎีกา", "ระเบียบ", "พ.ศ", "พศ"
  ]);
  return normalizeBotText(text)
    .split(/[\s,;:()]+/)
    .map(term => term.trim())
    .filter(term => term.length >= 2 && !stopWords.has(term));
}

function searchSubjectsByQuestion(text, monitor, limit = 20) {
  const subjects = monitor.subjects || [];
  const query = normalizeBotText(text);
  const compactQuery = normalizeNoSpace(query
    .replace(/วิชานี้|วิชา|ลงไปยัง|ลงยัง|หรือยัง|อยู่กลุ่มไหน|ต้องลงกลุ่มไหน|กลุ่มไหน|มีคลิปไหม|มีคลิปมั้ย|มีคลิป|ลิงก์|ลิงค์|เอกสาร|ล่าสุด|อัปเดต|อัพเดต|กี่วัน|อะไร|บ้าง|ไหม|มั้ย|ครับ|ค่ะ/g, " "));
  const terms = questionTerms(text);
  if (!compactQuery && !terms.length) return [];

  return subjects
    .map(subject => {
      const titleCompact = normalizeNoSpace(subject.title);
      const positionCompact = normalizeNoSpace(subject.position);
      const groupCompact = normalizeNoSpace(subject.group);
      const titleText = normalizeBotText(subject.title);
      let score = 0;
      let titleScore = 0;
      if (compactQuery && compactQuery.length >= 4) {
        if (titleCompact.includes(compactQuery) || compactQuery.includes(titleCompact)) {
          score += 80;
          titleScore += 80;
        }
      }
      // จับคู่แบบยืดหยุ่นสำหรับชื่อวิชาไทยที่พิมพ์ติดกัน (ไม่มีวรรค) ด้วย substring ร่วมที่ยาวสุด
      if (titleScore === 0 && compactQuery && compactQuery.length >= 6) {
        const lcs = longestCommonSubstringLen(compactQuery, titleCompact);
        if (lcs >= 6) {
          score += lcs;
          titleScore += lcs;
        }
      }
      for (const term of terms) {
        const compactTerm = normalizeNoSpace(term);
        if (!compactTerm) continue;
        if (titleText.includes(term) || titleCompact.includes(compactTerm)) {
          score += 10;
          titleScore += 10;
        } else if (positionCompact.includes(compactTerm) || groupCompact.includes(compactTerm)) {
          score += 2;
        }
        if (String(subject.order || "") === term) score += 2;
      }
      return { subject, score, titleScore };
    })
    .filter(item => item.titleScore > 0 && item.score > 0)
    .sort((a, b) => b.score - a.score || String(a.subject.position).localeCompare(String(b.subject.position), "th"))
    .slice(0, limit)
    .map(item => ({ ...item.subject, _score: item.score, _titleScore: item.titleScore }));
}

function answerSubjectQuestion(query, matches) {
  const top = matches[0] || {};
  const topScore = top._score || 0;
  const topTitle = normalizeNoSpace(top.title);
  const focusedMatches = matches.filter(subject =>
    normalizeNoSpace(subject.title) === topTitle ||
    (subject._score || 0) >= Math.max(25, topScore - 4)
  );
  const wantsPendingGroups = /ต้องลง|ยังไม่ลง|ค้าง|เหลือ|ต้องไป|ลงกลุ่มอะไร|ต้องลงกลุ่มไหน/.test(query);
  const wantsClip = /มีคลิป|คลิป/.test(query);
  const wantsGroups = /อยู่|กลุ่มไหน|กลุ่มอะไร|ต้องลง|ลงกลุ่ม/.test(query);
  const rows = wantsPendingGroups ? focusedMatches.filter(subject => subject.needsClipLink) : focusedMatches;
  const visible = rows.slice(0, 12);
  if (!visible.length) {
    return "วิชาที่ถามเจอในระบบแล้ว แต่ไม่พบกลุ่มที่ยังค้างลงลิงก์คลิปครับ";
  }

  const clipDone = focusedMatches.filter(subject => subject.clipStatusKind === "done").length;
  const clipPending = focusedMatches.filter(subject => subject.needsClipLink).length;
  const docPending = focusedMatches.filter(subject => subject.needsDocument).length;
  const clipFound = focusedMatches.filter(subject => subject.hasClip).length;
  const total = focusedMatches.length;
  const title = focusedMatches[0]?.title || "วิชาที่ค้นหา";

  // ตอบตรงคำถามเป็นประโยคแรก (ภาษามนุษย์) ตามเจตนาที่เด่นที่สุด
  const wantsDoc = /เอกสาร|ชีท|ไฟล์|pdf|ครบไหม|ครบมั้ย/.test(query);
  const wantsLink = /ลงลิงก|ลงลิงค|ลงหรือยัง|ลงยัง|ลงรึยัง|ลงแล้วยัง|ลงไหม|ลงมั้ย|โพสต์/.test(query);
  let headline;
  if (wantsClip && !wantsLink) {
    headline = clipFound >= total
      ? `มีคลิปในระบบครบทั้ง ${total} รายการ`
      : clipFound > 0
        ? `มีคลิปในระบบ ${clipFound} จาก ${total} รายการ`
        : `ยังไม่พบคลิปในระบบ (${total} รายการ)`;
  } else if (wantsDoc && !wantsLink) {
    headline = docPending === 0
      ? `เอกสารครบแล้วทั้ง ${total} รายการ`
      : `เอกสารยังไม่ครบ ค้าง ${docPending} จาก ${total} รายการ`;
  } else {
    headline = clipPending === 0
      ? `ลงลิงก์ครบแล้วทั้ง ${total} กลุ่ม/ตำแหน่ง`
      : `ยังไม่ลงลิงก์ ${clipPending} จาก ${total} กลุ่ม/ตำแหน่ง (ลงแล้ว ${clipDone})`;
  }

  const lines = [
    `วิชา: ${title}`,
    headline,
    `พบในระบบ ${total} กลุ่ม/ตำแหน่ง`,
    `ลงลิงก์แล้ว ${clipDone} | ยังไม่ลงลิงก์ ${clipPending} | เอกสารค้าง ${docPending}`,
    wantsClip ? `คลิปในระบบ: พบ ${clipFound} จาก ${total} รายการ` : "",
    "",
    wantsGroups || wantsPendingGroups ? "กลุ่ม/ตำแหน่งที่เกี่ยวข้อง:" : "สถานะรายกลุ่ม:"
  ].filter(Boolean);

  visible.forEach((subject, index) => {
    lines.push(formatSubjectStatusLine(subject, index + 1, { includeClip: wantsClip }));
    if (subject.link) lines.push(`   กลุ่ม: ${subject.link}`);
  });
  if (rows.length > visible.length) lines.push(`...ยังมีอีก ${rows.length - visible.length} รายการ`);
  return lines.join("\n").slice(0, 3900);
}

function answerStaleGroupsQuestion(monitor) {
  const rows = [...(monitor.positions || [])]
    .map(position => ({
      ...position,
      days: daysSinceDate(position.latestUpdate)
    }))
    .sort((a, b) => {
      const aDays = a.days == null ? 9999 : a.days;
      const bDays = b.days == null ? 9999 : b.days;
      return bDays - aDays || (b.missingCount || 0) - (a.missingCount || 0);
    })
    .slice(0, 15);
  const lines = [
    "กลุ่ม/ตำแหน่งที่ขาดการอัปเดตนานสุด",
    ""
  ];
  rows.forEach((position, index) => {
    const latest = position.latestUpdate
      ? `${formatShortThaiDate(position.latestUpdate)} (${formatUpdateAge(position.latestUpdate)})`
      : "ยังไม่มีข้อมูลล่าสุด";
    lines.push(`${index + 1}. ${position.name} - ล่าสุด ${latest} | ค้าง ${position.missingCount || 0} วิชา`);
    if (position.latestUpdateItem) lines.push(`   รายการล่าสุด: ${position.latestUpdateItem}`);
  });
  return lines.join("\n").slice(0, 3900);
}

function answerPositionQuestion(query, position, monitor) {
  const positionSubjects = (monitor.subjects || []).filter(subject => subject.position === position.name);
  const pendingSubjects = positionSubjects.filter(subject => subject.needsClipLink);
  const docPending = positionSubjects.filter(subject => subject.needsDocument);
  const wantsAllSubjects = /มีวิชา|วิชาอะไร|รายวิชา|วิชาทั้งหมด|ในกลุ่ม/.test(query);
  const wantsClip = /มีคลิป|คลิป/.test(query);
  const rows = (wantsAllSubjects ? positionSubjects : pendingSubjects).slice(0, 15);
  const latest = position.latestUpdate
    ? `${formatShortThaiDate(position.latestUpdate)} (${formatUpdateAge(position.latestUpdate)})`
    : "ยังไม่มีข้อมูลล่าสุด";

  // ประโยคแรกตอบตรงคำถามที่ถามถึงกลุ่มนี้
  const wantsDate = /ล่าสุด|วันไหน|กี่วัน|อัปเดต|อัพเดต|ลงเมื่อ|โพสต์|เงียบ/.test(query);
  let headline = "";
  if (wantsClip && !wantsDate) {
    headline = `มีคลิปรอลงลิงก์ ${position.pendingWithClip || 0} | ค้างลงลิงก์รวม ${position.missingCount || position.missing || 0} วิชา`;
  } else if (wantsDate) {
    headline = position.latestUpdate
      ? `ลงล่าสุด ${latest}${position.latestUpdateItem ? ` - ${position.latestUpdateItem}` : ""}`
      : "ยังไม่มีบันทึกการลงลิงก์ล่าสุดในกลุ่มนี้";
  }

  const lines = [
    `${position.name}`,
    headline,
    `สถานะคอร์ส: ${String(position.closedCourse || "").toLowerCase() === "true" ? "ปิดคอร์สแล้ว" : "ยังเปิดอยู่"}`,
    `คืบหน้า: ${position.percent || "0%"}`,
    `ลงแล้ว: ${position.done || 0}/${position.total || 0} | ยังไม่ลงลิงก์: ${position.missingCount || position.missing || 0}`,
    `เอกสารค้าง: ${docPending.length}`,
    `อัปเดตล่าสุด: ${latest}`,
    position.latestUpdateItem ? `รายการล่าสุด: ${position.latestUpdateItem}` : "",
    "",
    wantsAllSubjects ? "รายวิชาในกลุ่ม/ตำแหน่งนี้:" : "วิชาที่ยังต้องจัดการ:"
  ].filter(Boolean);
  if (rows.length) {
    rows.forEach((subject, index) => lines.push(formatSubjectStatusLine(subject, index + 1, { includeClip: wantsClip })));
  } else {
    lines.push(wantsAllSubjects ? "ยังไม่พบรายวิชาในข้อมูลล่าสุด" : "ไม่พบวิชาค้างลงลิงก์คลิปในกลุ่มนี้");
  }
  if (position.facebookUrl) {
    lines.push("");
    lines.push(`กลุ่ม: ${position.facebookUrl}`);
  }
  return lines.join("\n").slice(0, 3900);
}

function answerTelegramQuestion(text, monitor) {
  const query = normalizeBotText(text);
  if (!query || /^\/?(start|help|ช่วย)/i.test(query) || /ช่วย|ถามอะไรได้|ใช้ยังไง/.test(query)) {
    return buildTelegramHelpMessage();
  }

  const position = findPositionFromQuestion(query, monitor);
  // เจตนา "กลุ่มนี้มีวิชาอะไรบ้าง / รายวิชาในกลุ่ม"
  const wantsGroupListing = /มีวิชาอะไร|มีวิชาไหน|วิชาอะไรบ้าง|รายวิชา|วิชาทั้งหมด|มีกี่วิชา|วิชาในกลุ่ม|ในกลุ่มนี้มี|กลุ่มนี้มี/.test(query);
  // ถ้าระบุชื่อกลุ่ม/ตำแหน่งชัดเจน + เป็นคำถามระดับกลุ่ม (วันที่ล่าสุด, งานค้าง, มีคลิป, รายวิชา)
  // ให้ตอบสรุปกลุ่มก่อนค้นราย subject กันไม่ให้คำในชื่อวิชาบางคำไปแย่งคำตอบ
  const positionIntent = wantsGroupListing ||
    /ล่าสุด|วันไหน|กี่วัน|อัปเดต|อัพเดต|ลงเมื่อ|เงียบ|ลงล่าสุด|โพสต์ล่าสุด/.test(query) ||
    /เหลือ|ค้าง|คืบหน้า|กี่วิชา|สถานะ|มีคลิป|ขาด|เปอร์เซ็น|ครบ/.test(query) ||
    /ยังไม่ลง|ไม่ลงลิงก์|ไม่ลงลิงค์|ลงลิงก์อะไร|ลงลิงค์อะไร|รายวิชาที่ยังไม่ลง|วิชาที่ยังไม่ลง/.test(query);
  if (position && positionIntent) {
    return answerPositionQuestion(query, position, monitor);
  }

  const subjectMatches = searchSubjectsByQuestion(query, monitor, 30);
  if (subjectMatches.length) {
    return answerSubjectQuestion(query, subjectMatches);
  }

  // ระบุชื่อกลุ่มแต่ไม่เข้าเงื่อนไขข้างบน (เช่นถามลอยๆ ชื่อกลุ่ม) → สรุปกลุ่มนั้น
  if (position) {
    return answerPositionQuestion(query, position, monitor);
  }

  // คำว่า "สรุป/ภาพรวม" ให้ความสำคัญก่อนงานด่วน
  if (/สรุป|ภาพรวม|dashboard/.test(query)) {
    return buildTelegramSummaryMessage(monitor);
  }

  if (/ขาด.*อัปเดต|ขาด.*อัพเดต|ไม่อัปเดต|ไม่อัพเดต|เงียบ|กี่วัน|ล่าสุดวันไหน|อัปเดตล่าสุด|อัพเดตล่าสุด|ลงล่าสุด|โพสต์ล่าสุด/.test(query)) {
    return answerStaleGroupsQuestion(monitor);
  }

  if (/ด่วน|ก่อน|วันนี้|ควรทำ|ทำอะไรก่อน|priority/.test(query)) {
    const topTasks = (monitor.tasks || []).filter(task => ["urgent", "high"].includes(task.priority)).slice(0, 12);
    if (!topTasks.length) return "ยังไม่พบงานด่วนระดับสูงจากข้อมูลล่าสุด";
    return ["งานด่วนที่ควรทำก่อน", "", ...topTasks.map((task, index) => formatTaskLine(task, index + 1))].join("\n").slice(0, 3900);
  }

  if (/เอกสาร|ชีท|pdf|ไฟล์/.test(query)) {
    const docTasks = (monitor.tasks || []).filter(task => task.type === "document-missing").slice(0, 12);
    if (!docTasks.length) return "ยังไม่พบงานเอกสารค้างจากข้อมูลล่าสุด";
    return ["งานเอกสารค้าง", "", ...docTasks.map((task, index) => formatTaskLine(task, index + 1))].join("\n").slice(0, 3900);
  }

  if (/มีคลิป|ลงคลิป|ยังไม่ลงลิงก์|ยังไม่ลงลิงค์|โพสต์|คลิป/.test(query)) {
    const readyTasks = (monitor.tasks || []).filter(task => task.type === "clip-ready").slice(0, 12);
    if (!readyTasks.length) return "ยังไม่พบวิชาที่มีคลิปแล้วแต่ยังค้างลงลิงก์จากข้อมูลล่าสุด";
    return ["มีคลิปแล้ว แต่ยังค้างลงลิงก์", "", ...readyTasks.map((task, index) => formatTaskLine(task, index + 1))].join("\n").slice(0, 3900);
  }

  if (/สรุป|ภาพรวม|ค้าง|เหลือ|ทั้งหมด|dashboard/.test(query)) {
    return buildTelegramSummaryMessage(monitor);
  }

  const matches = searchTasksByQuestion(query, monitor.tasks || []).slice(0, 10);
  if (matches.length) {
    return ["พบรายการที่น่าจะเกี่ยวข้อง", "", ...matches.map((task, index) => formatTaskLine(task, index + 1))].join("\n").slice(0, 3900);
  }

  return `${buildTelegramSummaryMessage(monitor)}\n\nยังไม่แน่ใจคำถามเฉพาะนี้ ลองพิมพ์ชื่อตำแหน่งหรือชื่อวิชาเพิ่มอีกนิดครับ`;
}

function splitTelegramText(text) {
  const value = String(text || "");
  if (value.length <= 3900) return [value];
  const chunks = [];
  let remaining = value;
  while (remaining.length > 3900) {
    let index = remaining.lastIndexOf("\n", 3900);
    if (index < 1200) index = 3900;
    chunks.push(remaining.slice(0, index));
    remaining = remaining.slice(index).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

async function callTelegramApi(method, payload, config = null) {
  const telegram = config || await getTelegramConfig();
  if (!telegram.botToken) throw new Error("Telegram bot token is not configured");
  const response = await fetch(`https://api.telegram.org/bot${telegram.botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.ok === false) {
    throw new Error(json.description || `Telegram API ${method} failed (${response.status})`);
  }
  return json;
}

async function sendTelegramMessage(text, config = null, chatId = "") {
  const telegram = config || await getTelegramConfig();
  if (!telegram.configured && !(telegram.botToken && (chatId || telegram.chatId))) {
    throw new Error("Telegram bot token/chat id is not configured");
  }
  const targetChatId = String(chatId || telegram.chatId || "").trim();
  if (!targetChatId) throw new Error("Telegram chat id is not configured");
  const chunks = splitTelegramText(text);
  const results = [];
  for (const chunk of chunks) {
    results.push(await callTelegramApi("sendMessage", {
      chat_id: targetChatId,
      text: chunk,
      disable_web_page_preview: true
    }, telegram));
  }
  return { chunks: chunks.length, results };
}

function buildSubjectUpdateMessage(payload) {
  const statusTypeLabel = payload.statusType === "clip"
    ? "ลิงก์คลิป"
    : payload.statusType === "document" ? "เอกสาร" : "สถานะ";
  return [
    "อัปเดตสถานะงาน",
    `ตำแหน่ง: ${payload.position || "-"}`,
    `ลำดับ: ${payload.order || "-"}`,
    `วิชา: ${payload.title || "-"}`,
    `สถานะใหม่ (${statusTypeLabel}): ${payload.status || "-"}`
  ].join("\n");
}

function buildSubjectCatalogUpdateMessage(result) {
  if (result.action === "delete") {
    return [
      "อัปเดตรายวิชา",
      `ตำแหน่ง: ${result.position || "-"}`,
      `ลบวิชา: ${result.previousTitle || result.title || "-"}`,
      `ลำดับเดิม: ${result.order || "-"}`,
      result.shiftedCount
        ? `เลื่อนลำดับเฉพาะตำแหน่งนี้ขึ้น: ${result.shiftedCount} วิชา ตั้งแต่ลำดับ ${result.shiftedFromOrder || "-"}`
        : "ไม่ต้องเลื่อนลำดับวิชาอื่น"
    ].join("\n");
  }
  if (result.action === "insert") {
    return [
      "อัปเดตรายวิชา",
      `ตำแหน่ง: ${result.position || "-"}`,
      `แทรกวิชา: ${result.title || "-"}`,
      `ลำดับ: ${result.order || "-"}`,
      result.shiftedCount
        ? `เลื่อนลำดับเฉพาะตำแหน่งนี้: ${result.shiftedCount} วิชา ตั้งแต่ลำดับ ${result.shiftedFromOrder || result.order}`
        : "ไม่ต้องเลื่อนลำดับวิชาเดิม"
    ].join("\n");
  }
  return [
    "อัปเดตรายวิชา",
    `ตำแหน่ง: ${result.position || "-"}`,
    `ลำดับ: ${result.order || "-"}`,
    `แก้ชื่อเดิม: ${result.previousTitle || "-"}`,
    `ชื่อใหม่: ${result.title || "-"}`
  ].join("\n");
}

async function sendSubjectUpdateTelegram(sheetUrl, payload, result) {
  const telegram = await getTelegramConfig();
  if (!telegram.enabled || !telegram.configured || !telegram.sendOnManualUpdate) return null;
  const message = buildSubjectUpdateMessage(payload);
  return sendTelegramMessage(message, telegram);
}

async function sendSubjectCatalogUpdateTelegram(result) {
  const telegram = await getTelegramConfig();
  if (!telegram.enabled || !telegram.configured || !telegram.sendOnManualUpdate) return null;
  return sendTelegramMessage(buildSubjectCatalogUpdateMessage(result), telegram);
}

function verifyLineSignature(rawBody, signature, config) {
  if (!config.channelSecret || !signature) return false;
  const expected = createHmac("sha256", config.channelSecret)
    .update(rawBody, "utf8")
    .digest("base64");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

async function callLineApi(path, payload, config = null) {
  const line = config || await getLineConfig();
  if (!line.channelAccessToken) throw new Error("LINE channel access token is not configured");
  const response = await fetch(`https://api.line.me${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${line.channelAccessToken}`
    },
    body: JSON.stringify(payload)
  });
  const text = await response.text();
  let json = {};
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { message: text };
    }
  }
  if (!response.ok) {
    throw new Error(json.message || `LINE API ${path} failed (${response.status})`);
  }
  return json;
}

function buildLineTextMessages(text) {
  return splitTelegramText(text)
    .slice(0, 5)
    .map(chunk => ({ type: "text", text: chunk.slice(0, 4900) }));
}

async function pushLineMessage(text, config = null, targetId = "") {
  const line = config || await getLineConfig();
  const to = String(targetId || line.targetId || "").trim();
  if (!line.channelAccessToken || !to) throw new Error("LINE token/target id is not configured");
  return callLineApi("/v2/bot/message/push", {
    to,
    messages: buildLineTextMessages(text)
  }, line);
}

async function replyLineMessage(replyToken, text, config = null) {
  const line = config || await getLineConfig();
  if (!replyToken) throw new Error("LINE reply token is required");
  return callLineApi("/v2/bot/message/reply", {
    replyToken,
    messages: buildLineTextMessages(text)
  }, line);
}

async function sendSubjectUpdateLine(sheetUrl, payload, result) {
  const line = await getLineConfig();
  if (!line.enabled || !line.channelAccessToken || !line.targetId || !line.sendOnManualUpdate) return null;
  return pushLineMessage(buildSubjectUpdateMessage(payload), line);
}

async function sendSubjectCatalogUpdateLine(result) {
  const line = await getLineConfig();
  if (!line.enabled || !line.channelAccessToken || !line.targetId || !line.sendOnManualUpdate) return null;
  return pushLineMessage(buildSubjectCatalogUpdateMessage(result), line);
}

function lineEventSourceId(source = {}) {
  return String(source.groupId || source.roomId || source.userId || "").trim();
}

async function setTelegramWebhookFromConfig() {
  const telegram = await getTelegramConfig();
  if (!telegram.botToken) throw new Error("Telegram bot token is not configured");
  let secret = telegram.webhookSecret;
  const config = await readAppConfig();
  if (!secret) {
    secret = randomBytes(24).toString("hex");
    const savedConfig = mergeConfigForSave(config, {
      telegram: {
        ...(config.telegram || {}),
        webhookSecret: secret
      }
    });
    await writeFile(configPath, JSON.stringify(savedConfig, null, 2), "utf8");
  }
  const latestTelegram = await getTelegramConfig();
  const baseUrl = latestTelegram.publicBaseUrl;
  if (!baseUrl) throw new Error("Public base URL is not configured");
  const webhookUrl = `${baseUrl}/api/telegram/webhook/${encodeURIComponent(secret)}`;
  const response = await callTelegramApi("setWebhook", {
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ["message"]
  }, latestTelegram);
  return { webhookUrl, response, telegram: publicTelegramConfig(latestTelegram) };
}

function getZonedDateParts(timeZone = "Asia/Bangkok") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    dateKey: `${values.year}-${values.month}-${values.day}`,
    timeKey: `${values.hour}:${values.minute}`
  };
}

function startTelegramDailyScheduler() {
  const timer = setInterval(async () => {
    try {
      const telegram = await getTelegramConfig();
      if (!telegram.enabled || !telegram.configured || !telegram.dailySummaryTime) return;
      const now = getZonedDateParts(telegram.timeZone);
      if (now.timeKey !== telegram.dailySummaryTime) return;
      const state = await readJson(taskStatePath, {});
      const sendKey = `${now.dateKey}:${telegram.dailySummaryTime}`;
      if (state.lastTelegramDailySummaryKey === sendKey) return;
      const config = await readAppConfig();
      if (!config.sheetUrl) return;
      const monitor = await loadTaskMonitor(config.sheetUrl, await getBackgroundSheetAuth(), { includeLocalAudit: true });
      await sendTelegramMessage(buildTelegramSummaryMessage(monitor, { timeZone: telegram.timeZone }), telegram);
      await writeFile(taskStatePath, JSON.stringify({ ...state, lastTelegramDailySummaryKey: sendKey, lastTelegramDailySummaryAt: new Date().toISOString() }, null, 2), "utf8");
    } catch {}
  }, 60_000);
  timer.unref?.();
}

function startLineDailyScheduler() {
  const timer = setInterval(async () => {
    try {
      const line = await getLineConfig();
      if (!line.enabled || !line.channelAccessToken || !line.targetId || !line.dailySummaryTime) return;
      const now = getZonedDateParts(line.timeZone);
      if (now.timeKey !== line.dailySummaryTime) return;
      const state = await readJson(taskStatePath, {});
      const sendKey = `${now.dateKey}:${line.dailySummaryTime}`;
      if (state.lastLineDailySummaryKey === sendKey) return;
      const config = await readAppConfig();
      if (!config.sheetUrl) return;
      const monitor = await loadTaskMonitor(config.sheetUrl, await getBackgroundSheetAuth(), { includeLocalAudit: true });
      await pushLineMessage(buildTelegramSummaryMessage(monitor, { timeZone: line.timeZone }), line);
      await writeFile(taskStatePath, JSON.stringify({ ...state, lastLineDailySummaryKey: sendKey, lastLineDailySummaryAt: new Date().toISOString() }, null, 2), "utf8");
    } catch {}
  }, 60_000);
  timer.unref?.();
}

async function searchSubjects(sheetUrl, query, limit = 80, auth = null) {
  const spreadsheetId = extractSpreadsheetId(sheetUrl);
  if (!spreadsheetId) throw new Error("ไม่พบ spreadsheet id");
  const terms = buildSearchTerms(query);
  if (!terms.length) throw new Error("กรุณาใส่คำค้น");

  const csvText = await fetchSheetCsv(spreadsheetId, manualEntryGid, auth);
  const rows = parseCsv(csvText);
  const header = rows[0] || [];
  const positionIndex = header.indexOf("ตำแหน่ง");
  const groupIndex = header.indexOf("กลุ่ม");
  const orderIndex = header.indexOf("ลำดับ");
  const subjectIndex = header.indexOf("ชื่อวิชา/หัวข้อ");
  const statusIndex = columnIndex(header, clipLinkStatusHeaders);
  const documentStatusIndex = columnIndex(header, documentStatusHeaders);
  const noteIndex = header.indexOf("หมายเหตุ");
  const clipStatusIndex = header.indexOf("ลงคลิป");
  const linkIndex = header.indexOf("ลิงก์โพสต์/กลุ่ม");

  if (positionIndex < 0 || subjectIndex < 0) {
    throw new Error("ไม่พบคอลัมน์ตำแหน่งหรือชื่อวิชา/หัวข้อในชีต");
  }

  let dashboard = { positions: [] };
  try {
    dashboard = await loadDashboard(sheetUrl, auth);
  } catch {
    dashboard = { positions: [] };
  }
  const positionMeta = new Map((dashboard.positions || []).map(position => [position.name, position]));
  const manualSubjectRows = rows.slice(1)
    .map((row, index) => ({
      rowNumber: index + 2,
      position: (row[positionIndex] || "").trim(),
      group: row[groupIndex] || "",
      order: row[orderIndex] || String(index + 1),
      title: (row[subjectIndex] || "").trim(),
      sheetStatus: row[statusIndex] || "",
      documentStatus: row[documentStatusIndex] || "",
      link: row[linkIndex] || "",
      clipStatus: row[clipStatusIndex] || ""
    }))
    .filter(row => row.position && row.title);

  const results = rows.slice(1)
    .map((row, index) => {
      const position = (row[positionIndex] || "").trim();
      const title = (row[subjectIndex] || "").trim();
      if (!position || !title) return null;
      const meta = positionMeta.get(position) || {};
      const facebookUrl = isUrl(row[linkIndex]) ? row[linkIndex] : meta.facebookUrl || "";
      const haystack = [
        position,
        title,
        row[groupIndex] || "",
        row[orderIndex] || "",
        row[statusIndex] || "",
        row[documentStatusIndex] || "",
        row[noteIndex] || "",
        row[clipStatusIndex] || ""
      ].join(" ");
      const matchedTerms = matchedSearchTerms(haystack, terms);
      if (!matchedTerms.length) return null;
      return {
        rowNumber: index + 2,
        position,
        group: row[groupIndex] || "",
        order: row[orderIndex] || String(index + 1),
        title,
        sheetStatus: row[statusIndex] || "",
        documentStatus: row[documentStatusIndex] || "",
        note: row[noteIndex] || "",
        clipStatus: row[clipStatusIndex] || "",
        facebookUrl,
        matchedTerms,
        score: Math.round((matchedTerms.length / terms.length) * 100)
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.position.localeCompare(b.position, "th") || a.title.localeCompare(b.title, "th"))
    .slice(0, Math.min(Number(limit) || 80, 200));

  return {
    spreadsheetId,
    gid: manualEntryGid,
    query,
    count: results.length,
    results
  };
}

async function subjectPositions(sheetUrl, query, limit = 120, auth = null) {
  const spreadsheetId = extractSpreadsheetId(sheetUrl);
  if (!spreadsheetId) throw new Error("ไม่พบ spreadsheet id");
  const terms = buildSearchTerms(query);
  if (!terms.length) throw new Error("กรุณาใส่คำค้น");

  let dashboard = { positions: [] };
  try {
    dashboard = await loadDashboard(sheetUrl, auth);
  } catch {
    dashboard = { positions: [] };
  }
  const positionMeta = new Map((dashboard.positions || []).map(position => [position.name, position]));
  const manualRows = await loadManualRows(spreadsheetId, auth);
  const grouped = new Map();

  for (const row of manualRows) {
    const haystack = [
      row.title,
      row.position,
      row.group,
      row.order,
      row.sheetStatus,
      row.documentStatus,
      row.clipStatus,
      row.note
    ].join(" ");
    const matchedTerms = matchedSearchTerms(haystack, terms);
    if (!matchedTerms.length) continue;

    const subjectKey = normalizeSubjectKey(row.title);
    const card = grouped.get(subjectKey) || {
      title: row.title,
      score: 0,
      matchedTerms: new Set(),
      positions: []
    };
    const titleMatches = matchedSearchTerms(row.title, terms);
    let score = Math.round((matchedTerms.length / terms.length) * 100);
    if (titleMatches.length) score += Math.min(35, titleMatches.length * 12);
    if (compactSearchText(row.title).includes(compactSearchText(query))) score = 100;
    card.score = Math.max(card.score, Math.min(100, score));
    matchedTerms.forEach(term => card.matchedTerms.add(term));
    grouped.set(subjectKey, card);
  }

  for (const card of grouped.values()) {
    const sameSubjectRows = manualRows.filter(row => normalizeSubjectKey(row.title) === normalizeSubjectKey(card.title));
    for (const row of sameSubjectRows) {
      const meta = positionMeta.get(row.position) || {};
      const facebookUrl = isUrl(row.link) ? row.link : meta.facebookUrl || "";
      if (card.positions.some(position => position.position === row.position && position.order === row.order)) continue;
      card.positions.push({
        position: row.position,
        group: row.group || meta.groupLabel || "",
        order: row.order,
        sheetStatus: row.sheetStatus,
        documentStatus: row.documentStatus,
        clipStatus: row.clipStatus,
        facebookUrl,
        closedCourse: meta.closedCourse || "FALSE"
      });
    }
  }

  const cards = [...grouped.values()].map(card => {
    const linkedPositions = card.positions.filter(position => {
      const text = String(position.sheetStatus || position.clipStatus || "").trim().toLowerCase();
      if (!text || text.includes("ยังไม่") || text.includes("ไม่ลง") || text.includes("รอ")) return false;
      return (text.includes("ลง") && (text.includes("ลิง") || text.includes("link"))) || ["done", "yes", "true"].includes(text);
    });
    const pendingPositions = card.positions.filter(position => !linkedPositions.includes(position));
    return {
      title: card.title,
      score: card.score,
      matchedTerms: [...card.matchedTerms],
      totalPositions: card.positions.length,
      linkedCount: linkedPositions.length,
      pendingCount: pendingPositions.length,
      positions: card.positions,
      linkedPositions,
      pendingPositions
    };
  }).sort((a, b) => b.score - a.score || b.totalPositions - a.totalPositions || a.title.localeCompare(b.title, "th"));

  const cappedCards = cards.slice(0, Math.min(Number(limit) || 120, 300));
  return {
    spreadsheetId,
    gid: manualEntryGid,
    query,
    expandedTerms: terms,
    count: cappedCards.filter(card => card.score >= 70).length,
    nearbyCount: cappedCards.filter(card => card.score < 70).length,
    results: cappedCards.filter(card => card.score >= 70),
    nearby: cappedCards.filter(card => card.score < 70)
  };
}

const smartAliases = [
  {
    title: "พระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562",
    query: "PDPA",
    keys: ["pdpa", "ข้อมูล", "ข้อมูลส่วนบุคคล", "คุ้มครองข้อมูลส่วนบุคคล"],
    terms: ["pdpa", "ข้อมูลส่วนบุคคล", "คุ้มครองข้อมูลส่วนบุคคล", "พระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล", "2562"]
  },
  {
    title: "พระราชบัญญัติข้อมูลข่าวสารของราชการ พ.ศ. 2540",
    query: "ข้อมูลข่าวสาร",
    keys: ["ข้อมูล", "ข้อมูลข่าวสาร", "ข่าวสาร", "2540"],
    terms: ["ข้อมูลข่าวสาร", "ข้อมูลข่าวสารของราชการ", "พระราชบัญญัติข้อมูลข่าวสาร", "2540"]
  },
  {
    title: "การบริหารทรัพยากรบุคคลและการพัฒนาทรัพยากรบุคคล",
    query: "HRM HRD",
    keys: ["hrm", "hrd", "ทรัพยากรบุคคล", "บริหารทรัพยากรบุคคล"],
    terms: ["hrm", "hrd", "ทรัพยากรบุคคล", "บริหารทรัพยากรบุคคล", "พัฒนาทรัพยากรบุคคล", "นักทรัพย์"]
  }
];

smartAliases.push({
  title: "พระราชบัญญัติการปฏิบัติราชการทางอิเล็กทรอนิกส์ พ.ศ. 2565",
  query: "การปฏิบัติราชการทางอิเล็กทรอนิกส์",
  keys: ["การปฏิบัติราชการทางอิเล็กทรอนิกส์", "ปฏิบัติราชการทางอิเล็กทรอนิกส์", "ราชการทางอิเล็กทรอนิกส์", "ราชการอิเล็กทรอนิกส์", "อิเล็กทรอนิกส์", "2565"],
  terms: ["การปฏิบัติราชการทางอิเล็กทรอนิกส์", "ปฏิบัติราชการทางอิเล็กทรอนิกส์", "ราชการทางอิเล็กทรอนิกส์", "วิธีปฏิบัติราชการอิเล็กทรอนิกส์", "ปฏิบัติราชการอิเล็กทรอนิกส์", "ราชการอิเล็กทรอนิกส์", "อิเล็กทรอนิกส์", "2565"]
});

function expandSmartTerms(query) {
  const text = String(query || "").trim();
  const lower = text.toLowerCase();

  const terms = new Set(buildSearchTerms(lower));
  for (const alias of smartAliases) {
    if (alias.keys.some(key => lower.includes(key))) {
      alias.terms.forEach(term => terms.add(term.toLowerCase()));
    }
  }
  return [...terms];
}

function repairUtf8Mojibake(value) {
  const text = String(value || "");
  if (!/[à-ÿ]/.test(text)) return "";
  try {
    return Buffer.from(text, "latin1").toString("utf8");
  } catch {
    return "";
  }
}

function normalizeSearchText(value) {
  const original = String(value || "");
  const repaired = repairUtf8Mojibake(original);
  const text = repaired && repaired !== original ? `${original} ${repaired}` : original;
  return normalizeThaiDigits(text)
    .normalize("NFKC")
    .replace(/\u0E4D\u0E32/g, "ำ")
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/ฯ/g, "")
    .replace(/[()_.\-–—/,:;|[\]{}"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactSearchText(value) {
  return normalizeSearchText(value).replace(/\s+/g, "");
}

const conceptSearchTerms = [
  "การเมือง",
  "การปกครอง",
  "บริหารราชการ",
  "ราชการ",
  "เหตุการณ์ปัจจุบัน",
  "เศรษฐกิจ",
  "สังคม",
  "นโยบาย",
  "ยุทธศาสตร์",
  "กฎหมาย",
  "รัฐธรรมนูญ",
  "สิทธิ",
  "เสรีภาพ",
  "ท้องถิ่น",
  "ทรัพยากรบุคคล",
  "บริหารทรัพยากรบุคคล",
  "พัฒนาทรัพยากรบุคคล",
  "ข้อมูลส่วนบุคคล",
  "คุ้มครองข้อมูลส่วนบุคคล",
  "ข้อมูลข่าวสาร",
  "ความรับผิดทางละเมิด",
  "ละเมิด",
  "พัสดุ",
  "การเงิน",
  "บัญชี",
  "งบประมาณ"
];

conceptSearchTerms.push(
  "การปฏิบัติราชการทางอิเล็กทรอนิกส์",
  "ปฏิบัติราชการทางอิเล็กทรอนิกส์",
  "ราชการทางอิเล็กทรอนิกส์",
  "วิธีปฏิบัติราชการอิเล็กทรอนิกส์",
  "ปฏิบัติราชการอิเล็กทรอนิกส์",
  "ราชการอิเล็กทรอนิกส์",
  "อิเล็กทรอนิกส์",
  "พรบ อิเล็กทรอนิกส์",
  "พ.ร.บ. อิเล็กทรอนิกส์"
);

function addConceptSearchTerms(value, terms) {
  const normalized = normalizeSearchText(value);
  const compact = compactSearchText(value);
  for (const concept of conceptSearchTerms) {
    const normalizedConcept = normalizeSearchText(concept);
    const compactConcept = compactSearchText(concept);
    if (
      normalized.includes(normalizedConcept) ||
      compact.includes(compactConcept) ||
      compactConcept.includes(compact)
    ) {
      terms.add(normalizedConcept);
      if (compactConcept.length >= 4) terms.add(compactConcept);
    }
  }
}

function buildSearchTerms(value) {
  const normalized = normalizeSearchText(value);
  const terms = new Set();
  if (normalized) terms.add(normalized);
  for (const term of normalized.split(/\s+/).filter(Boolean)) {
    if (term.length >= 2) terms.add(term);
  }
  addConceptSearchTerms(value, terms);
  const compact = compactSearchText(value);
  if (compact.length >= 4) terms.add(compact);
  return [...terms];
}

function matchedSearchTerms(haystack, terms) {
  const normalizedHaystack = normalizeSearchText(haystack);
  const compactHaystack = compactSearchText(haystack);
  return terms.filter(term => {
    const normalizedTerm = normalizeSearchText(term);
    if (!normalizedTerm) return false;
    if (normalizedHaystack.includes(normalizedTerm)) return true;
    const compactTerm = compactSearchText(term);
    return compactTerm.length >= 4 && compactHaystack.includes(compactTerm);
  });
}

async function suggestSmartSearch(sheetUrl, query, limit = 12, auth = null) {
  const spreadsheetId = extractSpreadsheetId(sheetUrl);
  if (!spreadsheetId) throw new Error("ไม่พบ spreadsheet id");
  const text = String(query || "").trim();
  const lower = text.toLowerCase();
  if (!lower) {
    return {
      spreadsheetId,
      query: text,
      suggestions: smartAliases.slice(0, limit).map(alias => ({
        type: "alias",
        title: alias.title,
        query: alias.query,
        detail: `ขยายคำค้น: ${alias.terms.join(", ")}`
      }))
    };
  }

  const suggestions = [];
  const seen = new Set();
  const pushSuggestion = suggestion => {
    const key = `${suggestion.type}:${suggestion.query || suggestion.title}`.toLowerCase();
    if (seen.has(key) || suggestions.length >= limit) return;
    seen.add(key);
    suggestions.push(suggestion);
  };

  for (const alias of smartAliases) {
    const aliasHaystack = [alias.title, alias.query, ...alias.keys, ...alias.terms].join(" ").toLowerCase();
    if (aliasHaystack.includes(lower) || lower.includes(alias.query.toLowerCase())) {
      pushSuggestion({
        type: "alias",
        title: alias.title,
        query: alias.query,
        detail: `เราอาจกำลังหา: ${alias.terms.slice(0, 4).join(", ")}`
      });
    }
  }

  const manualRows = await loadManualRows(spreadsheetId, auth);
  const bySubject = new Map();
  for (const row of manualRows) {
    const haystack = `${row.title} ${row.position} ${row.group} ${row.note} ${row.documentStatus} ${row.clipStatus}`.toLowerCase();
    if (!haystack.includes(lower)) continue;
    const key = normalizeSubjectKey(row.title);
    const item = bySubject.get(key) || { title: row.title, positions: new Set(), done: 0, missing: 0 };
    item.positions.add(row.position);
    if (row.clipStatus) item.done += 1;
    else item.missing += 1;
    bySubject.set(key, item);
  }

  [...bySubject.values()]
    .sort((a, b) => b.positions.size - a.positions.size || a.title.localeCompare(b.title, "th"))
    .slice(0, limit)
    .forEach(item => {
      pushSuggestion({
        type: "subject",
        title: item.title,
        query: item.title,
        detail: `พบใน ${item.positions.size} ตำแหน่ง`
      });
    });

  const index = await readJson(indexPath, { files: [] });
  for (const file of (index.files || [])) {
    const haystack = `${file.name} ${file.relativePath || ""}`.toLowerCase();
    if (!haystack.includes(lower)) continue;
    pushSuggestion({
      type: "clip",
      title: file.name,
      query: text,
      detail: "พบชื่อคลิปในเครื่อง"
    });
    if (suggestions.length >= limit) break;
  }

  return {
    spreadsheetId,
    query: text,
    suggestions
  };
}

async function smartSearch(sheetUrl, query, limit = 80, auth = null) {
  const spreadsheetId = extractSpreadsheetId(sheetUrl);
  if (!spreadsheetId) throw new Error("ไม่พบ spreadsheet id");
  const terms = expandSmartTerms(query);
  if (!terms.length) throw new Error("กรุณาใส่คำค้น");

  const csvText = await fetchSheetCsv(spreadsheetId, manualEntryGid, auth);
  const rows = parseCsv(csvText);
  const header = rows[0] || [];
  const positionIndex = header.indexOf("ตำแหน่ง");
  const groupIndex = header.indexOf("กลุ่ม");
  const orderIndex = header.indexOf("ลำดับ");
  const subjectIndex = header.indexOf("ชื่อวิชา/หัวข้อ");
  const statusIndex = columnIndex(header, clipLinkStatusHeaders);
  const documentStatusIndex = columnIndex(header, documentStatusHeaders);
  const noteIndex = header.indexOf("หมายเหตุ");
  const clipStatusIndex = header.indexOf("ลงคลิป");
  const linkIndex = header.indexOf("ลิงก์โพสต์/กลุ่ม");

  if (positionIndex < 0 || subjectIndex < 0) {
    throw new Error("ไม่พบคอลัมน์ตำแหน่งหรือชื่อวิชา/หัวข้อในชีต");
  }

  let dashboard = { positions: [] };
  try {
    dashboard = await loadDashboard(sheetUrl, auth);
  } catch {
    dashboard = { positions: [] };
  }
  const positionMeta = new Map((dashboard.positions || []).map(position => [position.name, position]));
  const manualSubjectRows = rows.slice(1)
    .map((row, index) => ({
      rowNumber: index + 2,
      position: (row[positionIndex] || "").trim(),
      group: row[groupIndex] || "",
      order: row[orderIndex] || String(index + 1),
      title: (row[subjectIndex] || "").trim(),
      sheetStatus: row[statusIndex] || "",
      documentStatus: row[documentStatusIndex] || "",
      link: row[linkIndex] || "",
      clipStatus: row[clipStatusIndex] || ""
    }))
    .filter(row => row.position && row.title);

  const index = await readJson(indexPath, { files: [] });
  const files = enrichSearchResults(index.files || []);
  const clipMatches = files
    .map(file => {
      const haystack = `${file.name} ${file.relativePath || ""}`;
      const matchedTerms = matchedSearchTerms(haystack, terms);
      if (!matchedTerms.length) return null;
      return {
        ...file,
        matchedTerms,
        score: Math.round((matchedTerms.length / terms.length) * 100)
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || (b.modifiedMs || 0) - (a.modifiedMs || 0))
    .slice(0, 60);

  const subjectResults = rows.slice(1)
    .map((row, index) => {
      const position = (row[positionIndex] || "").trim();
      const title = (row[subjectIndex] || "").trim();
      if (!position || !title) return null;
      const haystack = [
        position,
        title,
        row[groupIndex] || "",
        row[orderIndex] || "",
        row[statusIndex] || "",
        row[documentStatusIndex] || "",
        row[noteIndex] || "",
        row[clipStatusIndex] || ""
      ].join(" ");
      const matchedTerms = matchedSearchTerms(haystack, terms);
      if (!matchedTerms.length) return null;

      const titleTokens = title.toLowerCase().split(/[\s/()_.-]+/).filter(term => term.length >= 3).slice(0, 8);
      const relatedClips = clipMatches
        .map(file => {
          const clipText = `${file.name} ${file.relativePath || ""}`.toLowerCase();
          const titleHits = titleTokens.filter(term => clipText.includes(term)).length;
          const aliasHits = file.matchedTerms?.length || 0;
          return { ...file, relationScore: aliasHits * 20 + titleHits * 6 + (file.newestForAnyTerm ? 3 : 0) };
        })
        .filter(file => file.relationScore > 0)
        .sort((a, b) => b.relationScore - a.relationScore || b.score - a.score)
        .slice(0, 5);

      const subjectKey = normalizeSubjectKey(title);
      const relatedPositions = manualSubjectRows
        .filter(subjectRow => normalizeSubjectKey(subjectRow.title) === subjectKey)
        .map(subjectRow => {
          const meta = positionMeta.get(subjectRow.position) || {};
          const facebookUrl = isUrl(subjectRow.link) ? subjectRow.link : meta.facebookUrl || "";
          return {
            position: subjectRow.position,
            group: subjectRow.group || meta.groupLabel || "",
            order: subjectRow.order,
            sheetStatus: subjectRow.sheetStatus,
            documentStatus: subjectRow.documentStatus,
            clipStatus: subjectRow.clipStatus,
            facebookUrl,
            closedCourse: meta.closedCourse || "FALSE"
          };
        });

      return {
        rowNumber: index + 2,
        position,
        group: row[groupIndex] || "",
        order: row[orderIndex] || String(index + 1),
        title,
        sheetStatus: row[statusIndex] || "",
        documentStatus: row[documentStatusIndex] || "",
        note: row[noteIndex] || "",
        clipStatus: row[clipStatusIndex] || "",
        matchedTerms,
        score: Math.round((matchedTerms.length / terms.length) * 100),
        clips: relatedClips,
        facebookUrl: isUrl(row[linkIndex]) ? row[linkIndex] : (positionMeta.get(position)?.facebookUrl || ""),
        relatedPositions
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.clips.length > 0) - (a.clips.length > 0) || b.score - a.score || a.position.localeCompare(b.position, "th"))
    .slice(0, Math.min(Number(limit) || 80, 200));

  return {
    spreadsheetId,
    gid: manualEntryGid,
    query,
    expandedTerms: terms,
    count: subjectResults.length,
    clipOnlyCount: clipMatches.length,
    results: subjectResults,
    clipOnly: clipMatches.slice(0, 20)
  };
}

async function handleApi(req, res, url) {
  if (url.pathname === "/api/auth/status" && req.method === "GET") {
    const config = await getAuthConfig();
    const serviceConfig = await getServiceAccountConfig();
    const session = await getRequestAuth(req);
    sendJson(res, 200, {
      ok: true,
      auth: {
        ...publicAuthConfig(config),
        serviceAccount: publicServiceAccountConfig(serviceConfig),
        appsScriptStatusWriter: publicAppsScriptStatusWriterConfig(await getAppsScriptStatusWriterConfig())
      },
      user: session ? {
        email: session.email,
        name: session.name,
        picture: session.picture || ""
      } : null
    });
    return true;
  }

  if (url.pathname === "/auth/google/login" && req.method === "GET") {
    const config = await getAuthConfig();
    if (!config.configured) {
      sendJson(res, 400, {
        ok: false,
        error: "ยังไม่ได้ตั้งค่า Google OAuth clientId/clientSecret ใน config.json หรือ environment variables"
      });
      return true;
    }
    const state = randomBytes(24).toString("hex");
    oauthStates.set(state, { createdAt: Date.now() });
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", config.clientId);
    authUrl.searchParams.set("redirect_uri", config.redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", googleScopes.join(" "));
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("state", state);
    redirect(res, authUrl.toString());
    return true;
  }

  if (url.pathname === "/auth/google/callback" && req.method === "GET") {
    const config = await getAuthConfig();
    const state = url.searchParams.get("state") || "";
    const code = url.searchParams.get("code") || "";
    const savedState = oauthStates.get(state);
    oauthStates.delete(state);
    if (!config.configured || !state || !code || !savedState || Date.now() - savedState.createdAt > 10 * 60 * 1000) {
      sendJson(res, 400, { ok: false, error: "Google login state ไม่ถูกต้องหรือหมดอายุ" });
      return true;
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: "authorization_code"
      })
    });
    const token = await tokenResponse.json();
    if (!tokenResponse.ok) {
      sendJson(res, 400, { ok: false, error: token.error_description || token.error || "แลก Google token ไม่สำเร็จ" });
      return true;
    }

    const user = await requireAllowedGoogleUser(token);
    const sessionId = randomBytes(32).toString("hex");
    authSessions.set(sessionId, {
      ...user,
      accessToken: token.access_token,
      refreshToken: token.refresh_token || "",
      expiresAt: Date.now() + Math.max(300, Number(token.expires_in || 3600) - 60) * 1000,
      createdAt: Date.now()
    });
    setAuthCookie(res, sessionId);
    redirect(res, "/");
    return true;
  }

  if (url.pathname === "/auth/logout" && (req.method === "POST" || req.method === "GET")) {
    const sessionId = parseCookies(req).clip_auth;
    if (sessionId) authSessions.delete(sessionId);
    clearAuthCookie(res);
    if (req.method === "GET") redirect(res, "/");
    else sendJson(res, 200, { ok: true });
    return true;
  }

  if (url.pathname === "/api/config" && req.method === "GET") {
    const config = await readAppConfig();
    sendJson(res, 200, sanitizeConfigForClient(config));
    return true;
  }

  if (url.pathname === "/api/config" && req.method === "POST") {
    const nextConfig = await readRequestJson(req);
    const existingConfig = await readAppConfig();
    if (existingConfig.onlineMode && existingConfig.requireLogin === false && process.env.NODE_ENV === "production") {
      sendJson(res, 403, { ok: false, error: "Public online mode does not allow saving app config from the browser" });
      return true;
    }
    await requireAppSession(req);
    const savedConfig = mergeConfigForSave(existingConfig, nextConfig);
    await writeFile(configPath, JSON.stringify(savedConfig, null, 2), "utf8");
    sendJson(res, 200, { ok: true, config: sanitizeConfigForClient(savedConfig) });
    return true;
  }

  if (url.pathname === "/api/line/webhook" && req.method === "POST") {
    const line = await getLineConfig();
    const rawBody = await readRequestText(req);
    if (!line.enabled || !line.channelAccessToken || !line.channelSecret || !line.allowNaturalLanguage) {
      sendJson(res, 200, { ok: true, ignored: true });
      return true;
    }

    const signature = String(req.headers["x-line-signature"] || "");
    if (!verifyLineSignature(rawBody, signature, line)) {
      sendJson(res, 403, { ok: false, error: "Invalid LINE signature" });
      return true;
    }

    const update = rawBody ? JSON.parse(rawBody) : {};
    const events = Array.isArray(update.events) ? update.events : [];
    for (const event of events) {
      const text = String(event.message?.text || "").trim();
      const sourceId = lineEventSourceId(event.source);
      if (event.type !== "message" || event.message?.type !== "text" || !event.replyToken || !text) continue;
      if (line.allowedSourceId && sourceId && sourceId !== line.allowedSourceId) continue;

      try {
        if (/^(\/?line\s*id|\/?lineid|group\s*id|source\s*id|ไลน์\s*ไอดี|ขอรหัสกลุ่ม)$/i.test(text)) {
          await replyLineMessage(event.replyToken, `LINE source id: ${sourceId || "-"}\nนำค่านี้ไปใส่ LINE_TARGET_ID ใน Render เพื่อให้ระบบส่งแจ้งเตือนไปห้องนี้ได้`, line);
          continue;
        }
        const config = await readAppConfig();
        const sheetUrl = config.sheetUrl || "";
        if (!sheetUrl) throw new Error("ยังไม่ได้ตั้งค่า Google Sheet URL");
        const monitor = await loadTaskMonitor(sheetUrl, await getBackgroundSheetAuth(), { includeLocalAudit: true });
        const answer = answerTelegramQuestion(text, monitor);
        await replyLineMessage(event.replyToken, answer, line);
      } catch (error) {
        try {
          await replyLineMessage(event.replyToken, `ตอบคำถามไม่สำเร็จ: ${error.message}`, line);
        } catch {}
      }
    }
    sendJson(res, 200, { ok: true, events: events.length });
    return true;
  }

  if (url.pathname.startsWith("/api/telegram/webhook/") && req.method === "POST") {
    const telegram = await getTelegramConfig();
    const pathSecret = decodeURIComponent(url.pathname.split("/").pop() || "");
    const headerSecret = String(req.headers["x-telegram-bot-api-secret-token"] || "");
    if (telegram.webhookSecret && pathSecret !== telegram.webhookSecret) {
      sendJson(res, 403, { ok: false, error: "Invalid Telegram webhook path" });
      return true;
    }
    if (telegram.webhookSecret && headerSecret && headerSecret !== telegram.webhookSecret) {
      sendJson(res, 403, { ok: false, error: "Invalid Telegram webhook secret" });
      return true;
    }

    const update = await readRequestJson(req);
    const message = update.message || update.edited_message || {};
    const chatId = String(message.chat?.id || "");
    const text = String(message.text || "").trim();
    if (!telegram.enabled || !telegram.configured || !telegram.allowNaturalLanguage || !chatId || !text) {
      sendJson(res, 200, { ok: true, ignored: true });
      return true;
    }
    if (telegram.allowedChatId && chatId !== telegram.allowedChatId) {
      sendJson(res, 200, { ok: true, ignored: true, reason: "chat-not-allowed" });
      return true;
    }

    try {
      const config = await readAppConfig();
      const sheetUrl = config.sheetUrl || "";
      if (!sheetUrl) throw new Error("ยังไม่ได้ตั้งค่า Google Sheet URL");
      const monitor = await loadTaskMonitor(sheetUrl, await getBackgroundSheetAuth(), { includeLocalAudit: true });
      const answer = answerTelegramQuestion(text, monitor);
      await sendTelegramMessage(answer, telegram, chatId);
      sendJson(res, 200, { ok: true });
    } catch (error) {
      try {
        await sendTelegramMessage(`ตอบคำถามไม่สำเร็จ: ${error.message}`, telegram, chatId);
      } catch {}
      sendJson(res, 200, { ok: true, error: error.message });
    }
    return true;
  }

  if (url.pathname === "/api/task-monitor" && req.method === "POST") {
    const body = await readRequestJson(req);
    const config = await readAppConfig();
    const sheetUrl = body.sheetUrl || config.sheetUrl;
    if (!sheetUrl || typeof sheetUrl !== "string") {
      sendJson(res, 400, { ok: false, error: "sheetUrl is required" });
      return true;
    }
    const result = await loadTaskMonitor(sheetUrl, await getSheetAuth(req), { includeLocalAudit: body.includeLocalAudit !== false });
    sendJson(res, 200, result);
    return true;
  }

  if (url.pathname === "/api/telegram/send-summary" && req.method === "POST") {
    const body = await readRequestJson(req);
    const config = await readAppConfig();
    const sheetUrl = body.sheetUrl || config.sheetUrl;
    if (!sheetUrl || typeof sheetUrl !== "string") {
      sendJson(res, 400, { ok: false, error: "sheetUrl is required" });
      return true;
    }
    const telegram = await getTelegramConfig();
    if (!telegram.enabled || !telegram.configured) {
      sendJson(res, 400, { ok: false, error: "Telegram is not enabled or configured" });
      return true;
    }
    const monitor = await loadTaskMonitor(sheetUrl, await getSheetAuth(req), { includeLocalAudit: body.includeLocalAudit !== false });
    const message = buildTelegramSummaryMessage(monitor, { timeZone: telegram.timeZone });
    const sent = await sendTelegramMessage(message, telegram);
    sendJson(res, 200, { ok: true, sent, monitor: { summary: monitor.summary, generatedAt: monitor.generatedAt } });
    return true;
  }

  if (url.pathname === "/api/telegram/test" && req.method === "POST") {
    const telegram = await getTelegramConfig();
    if (!telegram.enabled || !telegram.configured) {
      sendJson(res, 400, { ok: false, error: "Telegram is not enabled or configured" });
      return true;
    }
    const sent = await sendTelegramMessage(`ทดสอบระบบแจ้งเตือนซุนวู\nเวลา: ${formatThaiDateTimeText(new Date(), telegram.timeZone)}`, telegram);
    sendJson(res, 200, { ok: true, sent, telegram: publicTelegramConfig(telegram) });
    return true;
  }

  if (url.pathname === "/api/line/send-summary" && req.method === "POST") {
    const body = await readRequestJson(req);
    const config = await readAppConfig();
    const sheetUrl = body.sheetUrl || config.sheetUrl;
    if (!sheetUrl || typeof sheetUrl !== "string") {
      sendJson(res, 400, { ok: false, error: "sheetUrl is required" });
      return true;
    }
    const line = await getLineConfig();
    if (!line.enabled || !line.channelAccessToken || !line.targetId) {
      sendJson(res, 400, { ok: false, error: "LINE is not enabled or configured" });
      return true;
    }
    const monitor = await loadTaskMonitor(sheetUrl, await getSheetAuth(req), { includeLocalAudit: body.includeLocalAudit !== false });
    const sent = await pushLineMessage(buildTelegramSummaryMessage(monitor, { timeZone: line.timeZone }), line);
    sendJson(res, 200, { ok: true, sent, line: publicLineConfig(line), monitor: { summary: monitor.summary, generatedAt: monitor.generatedAt } });
    return true;
  }

  if (url.pathname === "/api/line/test" && req.method === "POST") {
    const line = await getLineConfig();
    if (!line.enabled || !line.channelAccessToken || !line.targetId) {
      sendJson(res, 400, { ok: false, error: "LINE is not enabled or configured" });
      return true;
    }
    const sent = await pushLineMessage(`ทดสอบระบบแจ้งเตือนซุนวูผ่าน LINE\nเวลา: ${formatThaiDateTimeText(new Date(), line.timeZone)}`, line);
    sendJson(res, 200, { ok: true, sent, line: publicLineConfig(line) });
    return true;
  }

  if (url.pathname === "/api/line/status" && req.method === "GET") {
    const line = await getLineConfig();
    sendJson(res, 200, {
      ok: true,
      line: publicLineConfig(line),
      webhookUrl: line.publicBaseUrl ? `${line.publicBaseUrl}/api/line/webhook` : ""
    });
    return true;
  }

  // ทดสอบคำตอบภาษามนุษย์โดยไม่ส่งเข้า Telegram (ใช้ตรวจ answerTelegramQuestion)
  if (url.pathname === "/api/telegram/ask" && req.method === "POST") {
    const body = await readRequestJson(req);
    const text = String(body.q || body.text || "").trim();
    if (!text) {
      sendJson(res, 400, { ok: false, error: "q is required" });
      return true;
    }
    const config = await readAppConfig();
    const sheetUrl = body.sheetUrl || config.sheetUrl;
    if (!sheetUrl || typeof sheetUrl !== "string") {
      sendJson(res, 400, { ok: false, error: "sheetUrl is required" });
      return true;
    }
    const monitor = await loadTaskMonitor(sheetUrl, await getSheetAuth(req), { includeLocalAudit: body.includeLocalAudit !== false });
    const answer = answerTelegramQuestion(text, monitor);
    sendJson(res, 200, { ok: true, q: text, answer });
    return true;
  }

  if (url.pathname === "/api/telegram/set-webhook" && req.method === "POST") {
    await requireAppSession(req);
    const result = await setTelegramWebhookFromConfig();
    sendJson(res, 200, { ok: true, ...result });
    return true;
  }

  if (url.pathname === "/api/telegram/webhook-info" && req.method === "GET") {
    await requireAppSession(req);
    const telegram = await getTelegramConfig();
    if (!telegram.botToken) {
      sendJson(res, 400, { ok: false, error: "Telegram bot token is not configured" });
      return true;
    }
    const info = await callTelegramApi("getWebhookInfo", {}, telegram);
    sendJson(res, 200, { ok: true, info, telegram: publicTelegramConfig(telegram) });
    return true;
  }

  if (url.pathname === "/api/scan" && req.method === "POST") {
    const body = await readRequestJson(req);
    const sourceRoot = cleanPathInput(body.sourceRoot);
    if (!sourceRoot || typeof sourceRoot !== "string") {
      sendJson(res, 400, { ok: false, error: "sourceRoot is required" });
      return true;
    }

    const previous = await readJson(indexPath, { files: [] });
    const previousPaths = new Set((previous.files || []).map(file => file.path));
    const videos = await scanVideos(sourceRoot);
    const currentPaths = new Set(videos.map(file => file.path));
    const added = videos.filter(file => !previousPaths.has(file.path));
    const removed = (previous.files || []).filter(file => !currentPaths.has(file.path));

    const index = {
      sourceRoot,
      scannedAt: new Date().toISOString(),
      files: videos
    };
    await writeFile(indexPath, JSON.stringify(index, null, 2), "utf8");

    sendJson(res, 200, {
      ok: true,
      sourceRoot,
      scannedAt: index.scannedAt,
      totalVideos: videos.length,
      addedCount: added.length,
      removedCount: removed.length,
      sample: videos.slice(0, 12),
      addedSample: added.slice(0, 8),
      removedSample: removed.slice(0, 8)
    });
    return true;
  }

  if (url.pathname === "/api/index" && req.method === "GET") {
    const index = await readJson(indexPath, { files: [] });
    sendJson(res, 200, {
      ok: true,
      sourceRoot: index.sourceRoot || "",
      scannedAt: index.scannedAt || "",
      totalVideos: (index.files || []).length,
      files: enrichSearchResults(index.files || [])
    });
    return true;
  }

  if (url.pathname === "/api/positions" && req.method === "POST") {
    const body = await readRequestJson(req);
    const sheetUrl = body.sheetUrl;
    if (!sheetUrl || typeof sheetUrl !== "string") {
      sendJson(res, 400, { ok: false, error: "sheetUrl is required" });
      return true;
    }

    const result = await loadPositions(sheetUrl, await getSheetAuth(req));
    sendJson(res, 200, { ok: true, ...result });
    return true;
  }

  if (url.pathname === "/api/dashboard" && req.method === "POST") {
    const body = await readRequestJson(req);
    const sheetUrl = body.sheetUrl;
    if (!sheetUrl || typeof sheetUrl !== "string") {
      sendJson(res, 400, { ok: false, error: "sheetUrl is required" });
      return true;
    }

    const result = await loadDashboard(sheetUrl, await getSheetAuth(req));
    sendJson(res, 200, { ok: true, ...result });
    return true;
  }

  if (url.pathname === "/api/document-library" && req.method === "POST") {
    const body = await readRequestJson(req);
    const sheetUrl = body.sheetUrl;
    if (!sheetUrl || typeof sheetUrl !== "string") {
      sendJson(res, 400, { ok: false, error: "sheetUrl is required" });
      return true;
    }

    const result = await loadDocumentLibrary(sheetUrl, body.gid || "", body.sheetName || "สารบัญเอกสาร", await getSheetAuth(req));
    sendJson(res, 200, { ok: true, ...result });
    return true;
  }

  if (url.pathname === "/api/subjects" && req.method === "POST") {
    const body = await readRequestJson(req);
    const sheetUrl = body.sheetUrl;
    const position = body.position;
    if (!sheetUrl || typeof sheetUrl !== "string") {
      sendJson(res, 400, { ok: false, error: "sheetUrl is required" });
      return true;
    }
    if (!position || typeof position !== "string") {
      sendJson(res, 400, { ok: false, error: "position is required" });
      return true;
    }

    const result = await loadSubjects(sheetUrl, position, await getSheetAuth(req));
    sendJson(res, 200, { ok: true, ...result });
    return true;
  }

  if (url.pathname === "/api/update-subject-status" && req.method === "POST") {
    const body = await readRequestJson(req);
    const sheetUrl = body.sheetUrl;
    if (!sheetUrl || typeof sheetUrl !== "string") {
      sendJson(res, 400, { ok: false, error: "sheetUrl is required" });
      return true;
    }

    const writer = await getAppsScriptStatusWriterConfig();
    const result = writer.configured
      ? await updateSubjectStatusViaAppsScript(sheetUrl, body, writer)
      : await updateSubjectStatus(sheetUrl, body, await getSheetAuth(req));
    sendSubjectUpdateTelegram(sheetUrl, body, result).catch(() => {});
    sendSubjectUpdateLine(sheetUrl, body, result).catch(() => {});
    sendJson(res, 200, { ok: true, ...result });
    return true;
  }

  if (url.pathname === "/api/update-subject-catalog" && req.method === "POST") {
    const body = await readRequestJson(req);
    const sheetUrl = body.sheetUrl;
    if (!sheetUrl || typeof sheetUrl !== "string") {
      sendJson(res, 400, { ok: false, error: "sheetUrl is required" });
      return true;
    }

    const result = await updateSubjectCatalog(sheetUrl, body, await getSheetAuth(req));
    sendSubjectCatalogUpdateTelegram(result).catch(() => {});
    sendSubjectCatalogUpdateLine(result).catch(() => {});
    sendJson(res, 200, { ok: true, ...result });
    return true;
  }

  if (url.pathname === "/api/smart-suggest" && req.method === "POST") {
    const body = await readRequestJson(req);
    const sheetUrl = body.sheetUrl;
    const query = body.query || "";
    const limit = body.limit || 12;
    if (!sheetUrl || typeof sheetUrl !== "string") {
      sendJson(res, 400, { ok: false, error: "sheetUrl is required" });
      return true;
    }

    const result = await suggestSmartSearch(sheetUrl, query, limit, await getSheetAuth(req));
    sendJson(res, 200, { ok: true, ...result });
    return true;
  }

  if (url.pathname === "/api/search-subjects" && req.method === "POST") {
    const body = await readRequestJson(req);
    const sheetUrl = body.sheetUrl;
    const query = body.query;
    const limit = body.limit || 80;
    if (!sheetUrl || typeof sheetUrl !== "string") {
      sendJson(res, 400, { ok: false, error: "sheetUrl is required" });
      return true;
    }
    if (!query || typeof query !== "string") {
      sendJson(res, 400, { ok: false, error: "query is required" });
      return true;
    }

    const result = await searchSubjects(sheetUrl, query, limit, await getSheetAuth(req));
    sendJson(res, 200, { ok: true, ...result });
    return true;
  }

  if (url.pathname === "/api/subject-positions" && req.method === "POST") {
    const body = await readRequestJson(req);
    const sheetUrl = body.sheetUrl;
    const query = body.query;
    const limit = body.limit || 120;
    if (!sheetUrl || typeof sheetUrl !== "string") {
      sendJson(res, 400, { ok: false, error: "sheetUrl is required" });
      return true;
    }
    if (!query || typeof query !== "string") {
      sendJson(res, 400, { ok: false, error: "query is required" });
      return true;
    }

    const result = await subjectPositions(sheetUrl, query, limit, await getSheetAuth(req));
    sendJson(res, 200, { ok: true, ...result });
    return true;
  }

  if (url.pathname === "/api/smart-search" && req.method === "POST") {
    const body = await readRequestJson(req);
    const sheetUrl = body.sheetUrl;
    const query = body.query;
    const limit = body.limit || 80;
    if (!sheetUrl || typeof sheetUrl !== "string") {
      sendJson(res, 400, { ok: false, error: "sheetUrl is required" });
      return true;
    }
    if (!query || typeof query !== "string") {
      sendJson(res, 400, { ok: false, error: "query is required" });
      return true;
    }

    const result = await smartSearch(sheetUrl, query, limit, await getSheetAuth(req));
    sendJson(res, 200, { ok: true, ...result });
    return true;
  }

  if (url.pathname === "/api/search-clips" && req.method === "POST") {
    const body = await readRequestJson(req);
    const query = String(body.query || "").trim();
    const limit = Math.min(Number(body.limit || 50), 100);
    if (!query) {
      sendJson(res, 400, { ok: false, error: "query is required" });
      return true;
    }

    const index = await readJson(indexPath, { files: [] });
    const terms = expandSmartTerms(query);
    const results = (index.files || [])
      .map(file => {
        const haystack = `${file.name} ${file.relativePath}`;
        const matchedTerms = matchedSearchTerms(haystack, terms);
        if (!matchedTerms.length) return null;
        const titleHits = matchedTerms.filter(term => {
          const normalizedTerm = normalizeSearchText(term);
          return normalizedTerm.length >= 3 && normalizeSearchText(file.name).includes(normalizedTerm);
        }).length;
        const yearHits = matchedTerms.filter(term => /^(25|26)\d{2}$/.test(normalizeSearchText(term))).length;
        const score = Math.min(100, Math.round((matchedTerms.length / Math.max(terms.length, 1)) * 70) + Math.min(24, titleHits * 6) + Math.min(10, yearHits * 10));
        return {
          ...file,
          matchedTerms,
          score
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || a.relativePath.localeCompare(b.relativePath, "th"))
      .slice(0, limit);

    sendJson(res, 200, {
      ok: true,
      query,
      sourceRoot: index.sourceRoot || "",
      scannedAt: index.scannedAt || "",
      count: results.length,
      results: enrichSearchResults(results)
    });
    return true;
  }

  if (url.pathname === "/api/reveal" && (req.method === "POST" || req.method === "GET")) {
    const body = req.method === "POST" ? await readRequestJson(req) : {};
    const targetPath = String(body.path || url.searchParams.get("path") || "").trim();
    if (!targetPath) {
      sendJson(res, 400, { ok: false, error: "path is required" });
      return true;
    }
    const revealed = await revealInExplorer(targetPath);
    sendJson(res, 200, { ok: true, ...revealed });
    return true;
  }

  if (url.pathname === "/api/open-folder" && (req.method === "POST" || req.method === "GET")) {
    const body = req.method === "POST" ? await readRequestJson(req) : {};
    const targetPath = String(body.path || url.searchParams.get("path") || "").trim();
    if (!targetPath) {
      sendJson(res, 400, { ok: false, error: "path is required" });
      return true;
    }
    const target = normalizeRoot(targetPath);
    let opened;
    try {
      const targetStats = await stat(target);
      if (targetStats.isDirectory()) {
        const safeFolder = escapePowerShellSingleQuoted(target);
        const command = `$folder = '${safeFolder}'; Start-Process -FilePath explorer.exe -ArgumentList "\`"$folder\`""`;
        const launch = await runPowerShell(command);
        opened = { folder: target, launch };
      } else {
        opened = await openContainingFolder(target);
      }
    } catch {
      opened = await openContainingFolder(target);
    }
    sendJson(res, 200, { ok: true, ...opened });
    return true;
  }

  if (url.pathname === "/api/dry-run" && req.method === "POST") {
    const body = await readRequestJson(req);
    const { destination, plan, errors } = buildOutputPlan(body);
    await enrichPlanSourceState(plan);
    const missingSources = plan.filter(item => !item.sourceExists);
    const blockingErrors = [
      ...errors,
      ...missingSources.map(item => `Source file not found: ${item.sourcePath}`)
    ];

    sendJson(res, 200, {
      ok: blockingErrors.length === 0,
      dryRunOnly: true,
      destinationRoot: destination,
      itemCount: plan.length,
      errors: blockingErrors,
      plan,
      log: [
        `DRY RUN ONLY - no files were written`,
        `Destination: ${destination}`,
        `Items: ${plan.length}`,
        ...plan.map((item, index) => `${index + 1}. ${item.outputName} -> ${item.sourcePath}`)
      ].join("\n")
    });
    return true;
  }

  if (url.pathname === "/api/validate-output" && req.method === "POST") {
    const body = await readRequestJson(req);
    const { destination, plan, errors } = buildOutputPlan(body);
    const sourceRoot = cleanPathInput(body.sourceRoot || "");
    const destinationInsideSource = sourceRoot ? isInside(sourceRoot, destination) : false;

    sendJson(res, 200, {
      ok: errors.length === 0,
      destinationRoot: destination,
      destinationInsideSource,
      checkedItems: plan.length,
      errors,
      guard: {
        writesOnlyInsideDestination: errors.length === 0,
        destructiveCleanupEnabled: false,
        sourceFolderWillNotBeModified: true,
        hardLinkSameVolumeOk: body.mode === "hardlink" ? plan.every(item => item.sourceOnSameVolume) : null
      }
    });
    return true;
  }

  if (url.pathname === "/api/orphan-check" && req.method === "POST") {
    const body = await readRequestJson(req);
    const { destination, plan, errors, orphaned, matching } = await checkOutputOrphans(body);

    sendJson(res, 200, {
      ok: errors.length === 0,
      destinationRoot: destination,
      expectedCount: plan.length,
      matchingCount: matching.length,
      orphanedCount: orphaned.length,
      orphaned,
      matching,
      errors,
      destructiveCleanupEnabled: false,
      note: "Report only. No files were deleted or modified."
    });
    return true;
  }

  if (url.pathname === "/api/create-hardlinks" && req.method === "POST") {
    const body = await readRequestJson(req);
    if (body.mode !== "hardlink") {
      sendJson(res, 400, { ok: false, error: "Only hardlink mode is enabled for real output creation" });
      return true;
    }

    const { destination, plan, errors } = buildOutputPlan(body);
    await enrichPlanSourceState(plan);
    const missingSources = plan.filter(item => !item.sourceExists);
    const blockingErrors = [
      ...errors,
      ...missingSources.map(item => `Source file not found: ${item.sourcePath}`)
    ];

    if (blockingErrors.length) {
      sendJson(res, 400, { ok: false, destinationRoot: destination, errors: blockingErrors, created: [] });
      return true;
    }

    await mkdir(destination, { recursive: true });
    const created = [];
    const skipped = [];
    for (const item of plan) {
      try {
        await access(item.outputPath);
        skipped.push({ ...item, reason: "Output already exists" });
        continue;
      } catch {}

      await mkdir(dirname(item.outputPath), { recursive: true });
      await link(item.sourcePath, item.outputPath);
      created.push(item);
    }

    sendJson(res, 200, {
      ok: true,
      mode: "hardlink",
      destinationRoot: destination,
      createdCount: created.length,
      skippedCount: skipped.length,
      created,
      skipped,
      warning: "Hard Links share the same file data as the source. Deleting the created link does not delete the source, but editing or saving over either link changes the shared video data."
    });
    return true;
  }

  if (url.pathname === "/api/stress-test" && req.method === "POST") {
    const body = await readRequestJson(req);
    const destination = assertDestinationSafe(body.destinationRoot);
    const mode = String(body.mode || "hardlink");
    const stressDir = resolve(destination, "_clip_app_stress_test");
    if (!isInside(destination, stressDir)) throw new Error("Stress test folder escaped destination");

    await mkdir(stressDir, { recursive: true });
    const sourcePath = resolve(stressDir, "พ.ร.บ. ข้อมูลข่าวสาร ๒๕๔๐ (ฉบับแก้ไข).mp4");
    await writeFile(sourcePath, "clip-organizer stress test placeholder\n", "utf8");

    const extension = outputExtension(mode === "copy" ? "url" : mode);
    const shortcutPath = resolve(stressDir, `01 - ทดสอบ path ไทย${mode === "hardlink" ? ".mp4" : extension}`);
    if (!isInside(stressDir, shortcutPath)) throw new Error("Stress shortcut escaped test folder");

    let bodyText = "";
    let note = "";
    if (mode === "hardlink") {
      try { await unlink(shortcutPath); } catch {}
      await link(sourcePath, shortcutPath);
      note = "Hard Link เปิดเหมือนไฟล์จริงและไม่คัดลอกข้อมูลซ้ำ แต่ต้องอยู่ไดรฟ์เดียวกัน";
    } else if (mode === "cmd") {
      bodyText = createCmdShortcutBody(sourcePath);
    } else if (mode === "lnk") {
      bodyText = "LNK stress test placeholder. Native .lnk creation is not enabled yet.\r\n";
      note = ".lnk ยังเป็นโหมดทดลอง ต้องเพิ่มตัวสร้าง native shortcut ก่อนใช้จริง";
    } else {
      bodyText = createUrlShortcutBody(sourcePath);
    }
    if (mode !== "hardlink") await writeFile(shortcutPath, bodyText, "utf8");

    sendJson(res, 200, {
      ok: true,
      mode,
      stressDir,
      sourcePath,
      shortcutPath,
      note,
      manualCheck: "Double-click the generated shortcut in _clip_app_stress_test and confirm it opens the dummy Thai-path file."
    });
    return true;
  }

  return false;
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://localhost:${port}`);

    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) {
      const handled = await handleApi(req, res, url);
      if (!handled) sendJson(res, 404, { ok: false, error: "Not found" });
      return;
    }

    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const target = normalize(join(root, decodeURIComponent(pathname)));

    if (!target.startsWith(root)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    const body = await readFile(target);
    res.writeHead(200, { "Content-Type": mime[extname(target)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(body);
  } catch (error) {
    if ((req.url || "").startsWith("/api/") || (req.url || "").startsWith("/auth/")) {
      const statusCode = Number(error.statusCode || 500);
      sendJson(res, statusCode, { ok: false, error: error.message || "Server error" });
    } else {
      res.writeHead(404);
      res.end("Not found");
    }
  }
}).listen(port, host, () => {
  const displayHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  console.log(`Prototype running at http://${displayHost}:${port}`);
});

startTelegramDailyScheduler();
startLineDailyScheduler();
