const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const { MongoClient } = require('mongodb');
const nodemailer = require('nodemailer');
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || 'soufiane_dev';
const SESSION_TTL_SECONDS = 86400;
const isProduction = process.env.NODE_ENV === 'production';
const MIME_TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const mongoClient = MONGODB_URI ? new MongoClient(MONGODB_URI) : null;
const mailer = process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD ? nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.GMAIL_USER.trim(), pass: process.env.GMAIL_APP_PASSWORD.replace(/\s+/g, '') } }) : null;
let usersCollection;
let sessionsCollection;

const sendJson = (response, status, payload, headers = {}) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers }); response.end(JSON.stringify(payload)); };
const parseCookies = (request) => Object.fromEntries((request.headers.cookie || '').split(';').filter(Boolean).map((part) => part.trim().split('=')));
const clearSessionCookie = { 'Set-Cookie': `soufiane_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${isProduction ? '; Secure' : ''}` };
const createSession = async (userId) => {
  const token = crypto.randomBytes(32).toString('hex');
  await sessionsCollection.insertOne({ token, userId, createdAt: new Date(), expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000) });
  return token;
};
const avatarPattern = /^data:image\/(jpeg|png|webp|gif);base64,[a-zA-Z0-9+/=]+$/;
const getSessionUserId = async (token) => {
  if (!token) return null;
  const session = await sessionsCollection.findOne({ token, expiresAt: { $gt: new Date() } });
  return session?.userId || null;
};
const deleteSession = (token) => token ? sessionsCollection.deleteOne({ token }) : Promise.resolve();
const sessionCookie = (token) => `soufiane_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}${isProduction ? '; Secure' : ''}`;
const getAuthenticatedUser = async (request) => {
  const token = parseCookies(request).soufiane_session;
  const userId = await getSessionUserId(token);
  return userId ? { token, userId, user: await usersCollection.findOne({ id: userId }) } : null;
};
const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, (error, derivedKey) => error ? reject(error) : resolve(`${salt}:${derivedKey.toString('hex')}`)));
const verifyPassword = (password, stored) => new Promise((resolve, reject) => { const [salt, key] = stored.split(':'); crypto.scrypt(password, salt, 64, (error, derivedKey) => { if (error) return reject(error); resolve(crypto.timingSafeEqual(Buffer.from(key, 'hex'), derivedKey)); }); });
const readBody = (request) => new Promise((resolve, reject) => { let body = ''; request.on('data', (chunk) => { body += chunk; if (body.length > 1e6) request.destroy(); }); request.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('Invalid JSON')); } }); request.on('error', reject); });

async function handleAuth(request, response, pathname) {
  try {
    const body = await readBody(request);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const name = String(body.name || '').trim();
    if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 6) return sendJson(response, 400, { error: 'Enter a valid email and a password of at least 6 characters.' });
    if (pathname === '/api/auth/signup' && !name) return sendJson(response, 400, { error: 'Enter your name to create an account.' });
    const existing = await usersCollection.findOne({ email });

    if (pathname === '/api/auth/signup') {
      if (existing?.verified) return sendJson(response, 409, { error: 'An account with this email already exists.' });
      if (existing && !existing.verified) await usersCollection.deleteOne({ _id: existing._id });
      if (!mailer) return sendJson(response, 503, { error: 'Email verification is not configured yet. Add Gmail settings to .env.' });
      const verificationCode = String(crypto.randomInt(100000, 1000000));
      const user = { id: crypto.randomUUID(), name, email, passwordHash: await hashPassword(password), verificationCodeHash: await hashPassword(verificationCode), verificationExpiresAt: Date.now() + 10 * 60 * 1000, verified: false, createdAt: new Date().toISOString() };
      await usersCollection.insertOne(user);
      try {
        await mailer.sendMail({ from: `SOUFIANE DEV <${process.env.GMAIL_USER.trim()}>`, to: user.email, subject: 'Your SOUFIANE DEV verification code', text: `Your verification code is ${verificationCode}. It expires in 10 minutes.` });
      } catch (mailError) {
        await usersCollection.deleteOne({ _id: user._id });
        return sendJson(response, 502, { error: 'Verification email could not be sent. Check Gmail App Password and try again.' });
      }
      return sendJson(response, 201, { requiresVerification: true, email: user.email });
    }

    if (!existing) return sendJson(response, 401, { error: 'Email or password is incorrect.' });
    if (!existing.verified) return sendJson(response, 403, { error: 'Please verify your email before logging in.' });
    if (!(await verifyPassword(password, existing.passwordHash))) return sendJson(response, 401, { error: 'Email or password is incorrect.' });
    const token = await createSession(existing.id);
    return sendJson(response, 200, { user: { name: existing.name, email: existing.email } }, { 'Set-Cookie': sessionCookie(token) });
  } catch (error) { sendJson(response, 400, { error: error.message }); }
}

async function verifyEmail(request, response) {
  try {
    const body = await readBody(request);
    const email = String(body.email || '').trim().toLowerCase();
    const code = String(body.code || '').trim();
    const user = await usersCollection.findOne({ email });
    if (!user || user.verified || !user.verificationCodeHash || Date.now() > user.verificationExpiresAt || !(await verifyPassword(code, user.verificationCodeHash))) return sendJson(response, 400, { error: 'That code is invalid or expired.' });
    await usersCollection.updateOne({ _id: user._id }, { $set: { verified: true }, $unset: { verificationCodeHash: '', verificationExpiresAt: '' } });
    const token = await createSession(user.id);
    return sendJson(response, 200, { verified: true, user: { name: user.name, email: user.email } }, { 'Set-Cookie': sessionCookie(token) });
  } catch (error) { return sendJson(response, 400, { error: error.message }); }
}

async function resendVerification(request, response) {
  try {
    const body = await readBody(request);
    const email = String(body.email || '').trim().toLowerCase();
    const user = await usersCollection.findOne({ email });
    if (!user || user.verified) return sendJson(response, 400, { error: 'No pending verification was found for this email.' });
    if (!mailer) return sendJson(response, 503, { error: 'Gmail is not configured. Add GMAIL_USER and GMAIL_APP_PASSWORD to .env.' });
    const verificationCode = String(crypto.randomInt(100000, 1000000));
    await usersCollection.updateOne({ _id: user._id }, { $set: { verificationCodeHash: await hashPassword(verificationCode), verificationExpiresAt: Date.now() + 10 * 60 * 1000 } });
    await mailer.sendMail({ from: `SOUFIANE DEV <${process.env.GMAIL_USER.trim()}>`, to: email, subject: 'Your SOUFIANE DEV verification code', text: `Your verification code is ${verificationCode}. It expires in 10 minutes.` });
    return sendJson(response, 200, { email });
  } catch (error) { return sendJson(response, 400, { error: error.message }); }
}

async function changePassword(request, response) {
  try {
    const sessionToken = parseCookies(request).soufiane_session;
    const userId = await getSessionUserId(sessionToken);
    if (!userId) return sendJson(response, 401, { error: 'Please log in again before changing your password.' });
    const body = await readBody(request);
    const currentPassword = String(body.currentPassword || '');
    const newPassword = String(body.newPassword || '');
    if (currentPassword.length < 6 || newPassword.length < 6) return sendJson(response, 400, { error: 'Passwords must be at least 6 characters.' });
    if (currentPassword === newPassword) return sendJson(response, 400, { error: 'Your new password must be different.' });
    const user = await usersCollection.findOne({ id: userId });
    if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) return sendJson(response, 401, { error: 'Current password is incorrect.' });
    await usersCollection.updateOne({ _id: user._id }, { $set: { passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date().toISOString() } });
    await sessionsCollection.deleteMany({ userId });
    const newSessionToken = await createSession(userId);
    return sendJson(response, 200, { passwordChanged: true }, { 'Set-Cookie': sessionCookie(newSessionToken) });
  } catch (error) {
    return sendJson(response, 400, { error: error.message });
  }
}

async function updateProfile(request, response) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (!auth?.user) return sendJson(response, 401, { error: 'Please log in again.' });
    const body = await readBody(request);
    const name = String(body.name || '').trim();
    if (name.length < 2 || name.length > 80) return sendJson(response, 400, { error: 'Name must contain between 2 and 80 characters.' });
    const avatar = body.avatar ? String(body.avatar) : '';
    if (avatar && (!avatarPattern.test(avatar) || avatar.length > 2_800_000)) return sendJson(response, 400, { error: 'Use a JPG, PNG, WEBP, or GIF image smaller than 2 MB.' });
    const update = { name, updatedAt: new Date().toISOString() };
    if (avatar) update.avatar = avatar;
    await usersCollection.updateOne({ _id: auth.user._id }, { $set: update });
    return sendJson(response, 200, { user: { name, email: auth.user.email, avatar: avatar || auth.user.avatar || '' } });
  } catch (error) { return sendJson(response, 400, { error: error.message }); }
}

async function listSessions(request, response) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (!auth?.user) return sendJson(response, 401, { error: 'Please log in again.' });
    const sessions = await sessionsCollection.find({ userId: auth.userId, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 }).toArray();
    return sendJson(response, 200, { sessions: sessions.map((session) => ({ current: session.token === auth.token, createdAt: session.createdAt, expiresAt: session.expiresAt })) });
  } catch (error) { return sendJson(response, 400, { error: error.message }); }
}

async function deleteAccount(request, response) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (!auth?.user) return sendJson(response, 401, { error: 'Please log in again.' });
    const body = await readBody(request);
    if (String(body.confirmation || '').trim().toUpperCase() !== 'DELETE') return sendJson(response, 400, { error: 'Type DELETE to confirm account removal.' });
    await usersCollection.deleteOne({ _id: auth.user._id });
    await sessionsCollection.deleteMany({ userId: auth.userId });
    return sendJson(response, 200, { deleted: true }, clearSessionCookie);
  } catch (error) { return sendJson(response, 400, { error: error.message }); }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (request.method === 'POST' && ['/api/auth/signup', '/api/auth/login'].includes(url.pathname)) return handleAuth(request, response, url.pathname);
  if (request.method === 'POST' && url.pathname === '/api/auth/verify') return verifyEmail(request, response);
  if (request.method === 'POST' && url.pathname === '/api/auth/resend') return resendVerification(request, response);
  if (request.method === 'POST' && url.pathname === '/api/auth/change-password') return changePassword(request, response);
  if (request.method === 'PATCH' && url.pathname === '/api/auth/profile') return updateProfile(request, response);
  if (request.method === 'GET' && url.pathname === '/api/auth/sessions') return listSessions(request, response);
  if (request.method === 'DELETE' && url.pathname === '/api/auth/account') return deleteAccount(request, response);
  if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
    const sessionId = parseCookies(request).soufiane_session;
    await deleteSession(sessionId);
    return sendJson(response, 200, { loggedOut: true }, clearSessionCookie);
  }
  if (request.method === 'GET' && url.pathname === '/api/auth/me') {
    const sessionId = parseCookies(request).soufiane_session;
    const userId = await getSessionUserId(sessionId);
    const user = userId && await usersCollection.findOne({ id: userId });
    return user ? sendJson(response, 200, { user: { name: user.name, email: user.email, avatar: user.avatar || '' } }) : sendJson(response, 401, { error: 'Not authenticated.' });
  }
  if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed.' });
  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.resolve(ROOT, `.${requested}`);
  if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return sendJson(response, 404, { error: 'Not found.' });
  response.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(response);
});

async function start() {
  if (!MONGODB_URI) throw new Error('MONGODB_URI is missing. Copy .env.example to .env and add your rotated MongoDB connection string.');
  if (MONGODB_URI.includes('<') || MONGODB_URI.includes('>')) throw new Error('MONGODB_URI still contains placeholders. Add the new MongoDB username and password in .env.');
  await mongoClient.connect();
  usersCollection = mongoClient.db(MONGODB_DB).collection('users');
  sessionsCollection = mongoClient.db(MONGODB_DB).collection('sessions');
  await usersCollection.createIndex({ email: 1 }, { unique: true });
  await sessionsCollection.createIndex({ token: 1 }, { unique: true });
  await sessionsCollection.createIndex({ userId: 1, expiresAt: 1 });
  await sessionsCollection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  server.listen(PORT, () => console.log(`SOUFIANE DEV running at http://localhost:${PORT}`));
}

start().catch((error) => { console.error(`Could not start server: ${error.message}`); process.exitCode = 1; });
