const crypto = require('node:crypto');
const { MongoClient } = require('mongodb');
const nodemailer = require('nodemailer');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || 'soufiane_dev';
const SESSION_TTL_SECONDS = 86400;
const isProduction = process.env.NODE_ENV === 'production';
const mongoClient = MONGODB_URI ? new MongoClient(MONGODB_URI) : null;
const mailer = process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD
  ? nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER.trim(),
      pass: process.env.GMAIL_APP_PASSWORD.replace(/\s+/g, '')
    }
  })
  : null;

let usersCollection;
let sessionsCollection;
let databasePromise;

const json = (statusCode, payload, headers = {}) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    ...headers
  },
  body: JSON.stringify(payload)
});

const getDatabase = async () => {
  if (!MONGODB_URI) throw new Error('MONGODB_URI is missing.');
  if (!databasePromise) {
    databasePromise = (async () => {
      if (!mongoClient) throw new Error('MONGODB_URI is missing.');
      await mongoClient.connect();
      const database = mongoClient.db(MONGODB_DB);
      usersCollection = database.collection('users');
      sessionsCollection = database.collection('sessions');
      await usersCollection.createIndex({ email: 1 }, { unique: true });
      await sessionsCollection.createIndex({ token: 1 }, { unique: true });
      await sessionsCollection.createIndex({ userId: 1, expiresAt: 1 });
      await sessionsCollection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
      return { usersCollection, sessionsCollection };
    })();
  }
  return databasePromise;
};

const parseCookies = (headers = {}) => Object.fromEntries(
  String(headers.cookie || headers.Cookie || '')
    .split(';')
    .filter(Boolean)
    .map((part) => {
      const index = part.indexOf('=');
      return index === -1
        ? [part.trim(), '']
        : [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
    })
);

const sessionCookie = (token) => `soufiane_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}${isProduction ? '; Secure' : ''}`;
const clearSessionCookie = `soufiane_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${isProduction ? '; Secure' : ''}`;
const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, (error, derivedKey) => error ? reject(error) : resolve(`${salt}:${derivedKey.toString('hex')}`)));
const verifyPassword = (password, stored) => new Promise((resolve, reject) => {
  const [salt, key] = stored.split(':');
  crypto.scrypt(password, salt, 64, (error, derivedKey) => {
    if (error) return reject(error);
    resolve(crypto.timingSafeEqual(Buffer.from(key, 'hex'), derivedKey));
  });
});
const getBody = (request) => {
  try {
    if (!request.body) return {};
    const raw = request.isBase64Encoded ? Buffer.from(request.body, 'base64').toString('utf8') : request.body;
    return typeof raw === 'string' ? JSON.parse(raw || '{}') : raw;
  } catch {
    throw new Error('Invalid JSON');
  }
};
const getSessionUserId = async (token) => {
  if (!token) return null;
  const { sessionsCollection: sessions } = await getDatabase();
  const session = await sessions.findOne({ token, expiresAt: { $gt: new Date() } });
  return session?.userId || null;
};
const createSession = async (userId) => {
  const { sessionsCollection: sessions } = await getDatabase();
  const token = crypto.randomBytes(32).toString('hex');
  await sessions.insertOne({ token, userId, createdAt: new Date(), expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000) });
  return token;
};
const getAuthenticatedUser = async (request) => {
  const token = parseCookies(request.headers).soufiane_session;
  const userId = await getSessionUserId(token);
  if (!userId) return null;
  const { usersCollection: users } = await getDatabase();
  const user = await users.findOne({ id: userId });
  return user ? { token, userId, user } : null;
};
const avatarPattern = /^data:image\/(jpeg|png|webp|gif);base64,[a-zA-Z0-9+/=]+$/;

async function handleAuth(request, pathname) {
  const { usersCollection: users } = await getDatabase();
  const body = getBody(request);
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const name = String(body.name || '').trim();
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 6) return json(400, { error: 'Enter a valid email and a password of at least 6 characters.' });
  if (pathname === '/api/auth/signup' && !name) return json(400, { error: 'Enter your name to create an account.' });
  const existing = await users.findOne({ email });
  if (pathname === '/api/auth/signup') {
    if (existing?.verified) return json(409, { error: 'An account with this email already exists.' });
    if (existing && !existing.verified) await users.deleteOne({ _id: existing._id });
    if (!mailer) return json(503, { error: 'Email verification is not configured yet. Add Gmail settings to .env.' });
    const verificationCode = String(crypto.randomInt(100000, 1000000));
    const user = { id: crypto.randomUUID(), name, email, passwordHash: await hashPassword(password), verificationCodeHash: await hashPassword(verificationCode), verificationExpiresAt: Date.now() + 10 * 60 * 1000, verified: false, createdAt: new Date().toISOString() };
    await users.insertOne(user);
    try {
      await mailer.sendMail({ from: `SOUFIANE DEV <${process.env.GMAIL_USER.trim()}>`, to: user.email, subject: 'Your SOUFIANE DEV verification code', text: `Your verification code is ${verificationCode}. It expires in 10 minutes.` });
    } catch (error) {
      await users.deleteOne({ _id: user._id });
      return json(502, { error: 'Verification email could not be sent. Check Gmail App Password and try again.' });
    }
    return json(201, { requiresVerification: true, email: user.email });
  }
  if (!existing) return json(401, { error: 'Email or password is incorrect.' });
  if (!existing.verified) return json(403, { error: 'Please verify your email before logging in.' });
  if (!(await verifyPassword(password, existing.passwordHash))) return json(401, { error: 'Email or password is incorrect.' });
  const token = await createSession(existing.id);
  return json(200, { user: { name: existing.name, email: existing.email } }, { 'Set-Cookie': sessionCookie(token) });
}

async function verifyEmail(request) {
  const { usersCollection: users } = await getDatabase();
  const body = getBody(request);
  const user = await users.findOne({ email: String(body.email || '').trim().toLowerCase() });
  if (!user || user.verified || !user.verificationCodeHash || Date.now() > user.verificationExpiresAt || !(await verifyPassword(String(body.code || '').trim(), user.verificationCodeHash))) return json(400, { error: 'That code is invalid or expired.' });
  await users.updateOne({ _id: user._id }, { $set: { verified: true }, $unset: { verificationCodeHash: '', verificationExpiresAt: '' } });
  const token = await createSession(user.id);
  return json(200, { verified: true, user: { name: user.name, email: user.email } }, { 'Set-Cookie': sessionCookie(token) });
}

async function resendVerification(request) {
  const { usersCollection: users } = await getDatabase();
  const email = String(getBody(request).email || '').trim().toLowerCase();
  const user = await users.findOne({ email });
  if (!user || user.verified) return json(400, { error: 'No pending verification was found for this email.' });
  if (!mailer) return json(503, { error: 'Gmail is not configured. Add GMAIL_USER and GMAIL_APP_PASSWORD to .env.' });
  const verificationCode = String(crypto.randomInt(100000, 1000000));
  await users.updateOne({ _id: user._id }, { $set: { verificationCodeHash: await hashPassword(verificationCode), verificationExpiresAt: Date.now() + 10 * 60 * 1000 } });
  await mailer.sendMail({ from: `SOUFIANE DEV <${process.env.GMAIL_USER.trim()}>`, to: email, subject: 'Your SOUFIANE DEV verification code', text: `Your verification code is ${verificationCode}. It expires in 10 minutes.` });
  return json(200, { email });
}

async function changePassword(request) {
  const { usersCollection: users, sessionsCollection: sessions } = await getDatabase();
  const auth = await getAuthenticatedUser(request);
  if (!auth) return json(401, { error: 'Please log in again before changing your password.' });
  const body = getBody(request);
  const currentPassword = String(body.currentPassword || '');
  const newPassword = String(body.newPassword || '');
  if (currentPassword.length < 6 || newPassword.length < 6) return json(400, { error: 'Passwords must be at least 6 characters.' });
  if (currentPassword === newPassword) return json(400, { error: 'Your new password must be different.' });
  if (!(await verifyPassword(currentPassword, auth.user.passwordHash))) return json(401, { error: 'Current password is incorrect.' });
  await users.updateOne({ _id: auth.user._id }, { $set: { passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date().toISOString() } });
  await sessions.deleteMany({ userId: auth.userId });
  return json(200, { passwordChanged: true }, { 'Set-Cookie': sessionCookie(await createSession(auth.userId)) });
}

async function updateProfile(request) {
  const { usersCollection: users } = await getDatabase();
  const auth = await getAuthenticatedUser(request);
  if (!auth?.user) return json(401, { error: 'Please log in again.' });
  const body = getBody(request);
  const name = String(body.name || '').trim();
  const avatar = body.avatar ? String(body.avatar) : '';
  if (name.length < 2 || name.length > 80) return json(400, { error: 'Name must contain between 2 and 80 characters.' });
  if (avatar && (!avatarPattern.test(avatar) || avatar.length > 2800000)) return json(400, { error: 'Use a JPG, PNG, WEBP, or GIF image smaller than 2 MB.' });
  const update = { name, updatedAt: new Date().toISOString() };
  if (avatar) update.avatar = avatar;
  await users.updateOne({ _id: auth.user._id }, { $set: update });
  return json(200, { user: { name, email: auth.user.email, avatar: avatar || auth.user.avatar || '' } });
}

async function listSessions(request) {
  const { sessionsCollection: sessions } = await getDatabase();
  const auth = await getAuthenticatedUser(request);
  if (!auth?.user) return json(401, { error: 'Please log in again.' });
  const activeSessions = await sessions.find({ userId: auth.userId, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 }).toArray();
  return json(200, { sessions: activeSessions.map((session) => ({ current: session.token === auth.token, createdAt: session.createdAt, expiresAt: session.expiresAt })) });
}

async function deleteAccount(request) {
  const { usersCollection: users, sessionsCollection: sessions } = await getDatabase();
  const auth = await getAuthenticatedUser(request);
  if (!auth?.user) return json(401, { error: 'Please log in again.' });
  if (String(getBody(request).confirmation || '').trim().toUpperCase() !== 'DELETE') return json(400, { error: 'Type DELETE to confirm account removal.' });
  await users.deleteOne({ _id: auth.user._id });
  await sessions.deleteMany({ userId: auth.userId });
  return json(200, { deleted: true }, { 'Set-Cookie': clearSessionCookie });
}

async function logout(request) {
  const { sessionsCollection: sessions } = await getDatabase();
  const token = parseCookies(request.headers).soufiane_session;
  if (token) await sessions.deleteOne({ token });
  return json(200, { loggedOut: true }, { 'Set-Cookie': clearSessionCookie });
}

async function me(request) {
  const { usersCollection: users } = await getDatabase();
  const userId = await getSessionUserId(parseCookies(request.headers).soufiane_session);
  const user = userId && await users.findOne({ id: userId });
  return user ? json(200, { user: { name: user.name, email: user.email, avatar: user.avatar || '' } }) : json(401, { error: 'Not authenticated.' });
}

const handleRequest = async (request) => {
  try {
    const { method, path } = request;
    if (method === 'POST' && ['/api/auth/signup', '/api/auth/login'].includes(path)) return await handleAuth(request, path);
    if (method === 'POST' && path === '/api/auth/verify') return await verifyEmail(request);
    if (method === 'POST' && path === '/api/auth/resend') return await resendVerification(request);
    if (method === 'POST' && path === '/api/auth/change-password') return await changePassword(request);
    if (method === 'PATCH' && path === '/api/auth/profile') return await updateProfile(request);
    if (method === 'GET' && path === '/api/auth/sessions') return await listSessions(request);
    if (method === 'DELETE' && path === '/api/auth/account') return await deleteAccount(request);
    if (method === 'POST' && path === '/api/auth/logout') return await logout(request);
    if (method === 'GET' && path === '/api/auth/me') return await me(request);
    return json(404, { error: 'API route not found.' });
  } catch (error) {
    console.error(error);
    return json(500, { error: isProduction ? 'Internal server error.' : error.message });
  }
};

module.exports = { handleRequest };
