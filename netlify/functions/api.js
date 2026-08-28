const crypto = require('node:crypto');
const { MongoClient } = require('mongodb');
const nodemailer = require('nodemailer');

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || 'soufiane_dev';
const SESSION_TTL_SECONDS = 86400;

let mongoClient;
let usersCollection;
let sessionsCollection;
let mailer;

const getDb = async () => {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is missing.');
  }

  if (!mongoClient) {
    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();

    const db = mongoClient.db(MONGODB_DB);

    usersCollection = db.collection('users');
    sessionsCollection = db.collection('sessions');

    await usersCollection.createIndex({ email: 1 }, { unique: true });
    await sessionsCollection.createIndex({ token: 1 }, { unique: true });
    await sessionsCollection.createIndex({ userId: 1, expiresAt: 1 });
    await sessionsCollection.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0 }
    );

    if (
      process.env.GMAIL_USER &&
      process.env.GMAIL_APP_PASSWORD
    ) {
      mailer = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.GMAIL_USER.trim(),
          pass: process.env.GMAIL_APP_PASSWORD.replace(/\s+/g, '')
        }
      });
    }
  }

  return {
    usersCollection,
    sessionsCollection
  };
};

const json = (statusCode, body, headers = {}) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    ...headers
  },
  body: JSON.stringify(body)
});

const getBody = (event) => {
  try {
    if (!event.body) return {};

    const raw = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;

    return JSON.parse(raw || '{}');
  } catch {
    throw new Error('Invalid JSON');
  }
};

const parseCookies = (event) => {
  const cookieHeader =
    event.headers?.cookie ||
    event.headers?.Cookie ||
    '';

  return Object.fromEntries(
    cookieHeader
      .split(';')
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');

        if (index === -1) {
          return [part.trim(), ''];
        }

        return [
          part.slice(0, index).trim(),
          decodeURIComponent(part.slice(index + 1).trim())
        ];
      })
  );
};

const sessionCookie = (token) =>
  `soufiane_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}; Secure`;

const clearSessionCookie =
  'soufiane_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Secure';

const hashPassword = (
  password,
  salt = crypto.randomBytes(16).toString('hex')
) =>
  new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      64,
      (error, derivedKey) => {
        if (error) return reject(error);

        resolve(
          `${salt}:${derivedKey.toString('hex')}`
        );
      }
    );
  });

const verifyPassword = (password, stored) =>
  new Promise((resolve, reject) => {
    try {
      const [salt, key] = stored.split(':');

      crypto.scrypt(
        password,
        salt,
        64,
        (error, derivedKey) => {
          if (error) return reject(error);

          resolve(
            crypto.timingSafeEqual(
              Buffer.from(key, 'hex'),
              derivedKey
            )
          );
        }
      );
    } catch (error) {
      reject(error);
    }
  });

const createSession = async (userId) => {
  const { sessionsCollection } = await getDb();

  const token = crypto.randomBytes(32).toString('hex');

  await sessionsCollection.insertOne({
    token,
    userId,
    createdAt: new Date(),
    expiresAt: new Date(
      Date.now() + SESSION_TTL_SECONDS * 1000
    )
  });

  return token;
};

const getSessionUserId = async (token) => {
  if (!token) return null;

  const { sessionsCollection } = await getDb();

  const session = await sessionsCollection.findOne({
    token,
    expiresAt: { $gt: new Date() }
  });

  return session?.userId || null;
};

const getAuthenticatedUser = async (event) => {
  const cookies = parseCookies(event);
  const token = cookies.soufiane_session;

  const userId = await getSessionUserId(token);

  if (!userId) return null;

  const { usersCollection } = await getDb();

  const user = await usersCollection.findOne({
    id: userId
  });

  return user
    ? { token, userId, user }
    : null;
};

const avatarPattern =
  /^data:image\/(jpeg|png|webp|gif);base64,[a-zA-Z0-9+/=]+$/;

async function handleAuth(event, pathname) {
  const { usersCollection } = await getDb();
  const body = getBody(event);

  const email = String(body.email || '')
    .trim()
    .toLowerCase();

  const password = String(body.password || '');
  const name = String(body.name || '').trim();

  if (
    !/^\S+@\S+\.\S+$/.test(email) ||
    password.length < 6
  ) {
    return json(400, {
      error:
        'Enter a valid email and a password of at least 6 characters.'
    });
  }

  if (pathname === '/api/auth/signup' && !name) {
    return json(400, {
      error: 'Enter your name to create an account.'
    });
  }

  const existing = await usersCollection.findOne({
    email
  });

  if (pathname === '/api/auth/signup') {
    if (existing?.verified) {
      return json(409, {
        error:
          'An account with this email already exists.'
      });
    }

    if (existing && !existing.verified) {
      await usersCollection.deleteOne({
        _id: existing._id
      });
    }

    if (!mailer) {
      return json(503, {
        error:
          'Email verification is not configured.'
      });
    }

    const verificationCode = String(
      crypto.randomInt(100000, 1000000)
    );

    const user = {
      id: crypto.randomUUID(),
      name,
      email,
      passwordHash: await hashPassword(password),
      verificationCodeHash:
        await hashPassword(verificationCode),
      verificationExpiresAt:
        Date.now() + 10 * 60 * 1000,
      verified: false,
      createdAt: new Date().toISOString()
    };

    await usersCollection.insertOne(user);

    try {
      await mailer.sendMail({
        from: `SOUFIANE DEV <${process.env.GMAIL_USER.trim()}>`,
        to: user.email,
        subject:
          'Your SOUFIANE DEV verification code',
        text:
          `Your verification code is ${verificationCode}. ` +
          'It expires in 10 minutes.'
      });
    } catch {
      await usersCollection.deleteOne({
        _id: user._id
      });

      return json(502, {
        error:
          'Verification email could not be sent.'
      });
    }

    return json(201, {
      requiresVerification: true,
      email: user.email
    });
  }

  if (!existing) {
    return json(401, {
      error: 'Email or password is incorrect.'
    });
  }

  if (!existing.verified) {
    return json(403, {
      error:
        'Please verify your email before logging in.'
    });
  }

  if (
    !(await verifyPassword(
      password,
      existing.passwordHash
    ))
  ) {
    return json(401, {
      error: 'Email or password is incorrect.'
    });
  }

  const token = await createSession(existing.id);

  return json(
    200,
    {
      user: {
        name: existing.name,
        email: existing.email
      }
    },
    {
      'Set-Cookie': sessionCookie(token)
    }
  );
}

async function verifyEmail(event) {
  const { usersCollection } = await getDb();
  const body = getBody(event);

  const email = String(body.email || '')
    .trim()
    .toLowerCase();

  const code = String(body.code || '').trim();

  const user = await usersCollection.findOne({
    email
  });

  if (
    !user ||
    user.verified ||
    !user.verificationCodeHash ||
    Date.now() > user.verificationExpiresAt ||
    !(await verifyPassword(
      code,
      user.verificationCodeHash
    ))
  ) {
    return json(400, {
      error: 'That code is invalid or expired.'
    });
  }

  await usersCollection.updateOne(
    { _id: user._id },
    {
      $set: { verified: true },
      $unset: {
        verificationCodeHash: '',
        verificationExpiresAt: ''
      }
    }
  );

  const token = await createSession(user.id);

  return json(
    200,
    {
      verified: true,
      user: {
        name: user.name,
        email: user.email
      }
    },
    {
      'Set-Cookie': sessionCookie(token)
    }
  );
}

async function resendVerification(event) {
  const { usersCollection } = await getDb();
  const body = getBody(event);

  const email = String(body.email || '')
    .trim()
    .toLowerCase();

  const user = await usersCollection.findOne({
    email
  });

  if (!user || user.verified) {
    return json(400, {
      error:
        'No pending verification was found for this email.'
    });
  }

  if (!mailer) {
    return json(503, {
      error: 'Gmail is not configured.'
    });
  }

  const verificationCode = String(
    crypto.randomInt(100000, 1000000)
  );

  await usersCollection.updateOne(
    { _id: user._id },
    {
      $set: {
        verificationCodeHash:
          await hashPassword(verificationCode),
        verificationExpiresAt:
          Date.now() + 10 * 60 * 1000
      }
    }
  );

  await mailer.sendMail({
    from: `SOUFIANE DEV <${process.env.GMAIL_USER.trim()}>`,
    to: email,
    subject:
      'Your SOUFIANE DEV verification code',
    text:
      `Your verification code is ${verificationCode}. ` +
      'It expires in 10 minutes.'
  });

  return json(200, { email });
}

async function changePassword(event) {
  const { usersCollection, sessionsCollection } =
    await getDb();

  const auth = await getAuthenticatedUser(event);

  if (!auth) {
    return json(401, {
      error:
        'Please log in again before changing your password.'
    });
  }

  const body = getBody(event);

  const currentPassword =
    String(body.currentPassword || '');

  const newPassword =
    String(body.newPassword || '');

  if (
    currentPassword.length < 6 ||
    newPassword.length < 6
  ) {
    return json(400, {
      error:
        'Passwords must be at least 6 characters.'
    });
  }

  if (currentPassword === newPassword) {
    return json(400, {
      error:
        'Your new password must be different.'
    });
  }

  if (
    !(await verifyPassword(
      currentPassword,
      auth.user.passwordHash
    ))
  ) {
    return json(401, {
      error: 'Current password is incorrect.'
    });
  }

  await usersCollection.updateOne(
    { _id: auth.user._id },
    {
      $set: {
        passwordHash:
          await hashPassword(newPassword),
        passwordChangedAt:
          new Date().toISOString()
      }
    }
  );

  await sessionsCollection.deleteMany({
    userId: auth.userId
  });

  const newToken = await createSession(
    auth.userId
  );

  return json(
    200,
    { passwordChanged: true },
    {
      'Set-Cookie': sessionCookie(newToken)
    }
  );
}

async function updateProfile(event) {
  const { usersCollection } = await getDb();

  const auth = await getAuthenticatedUser(event);

  if (!auth?.user) {
    return json(401, {
      error: 'Please log in again.'
    });
  }

  const body = getBody(event);

  const name = String(body.name || '').trim();
  const avatar = body.avatar
    ? String(body.avatar)
    : '';

  if (name.length < 2 || name.length > 80) {
    return json(400, {
      error:
        'Name must contain between 2 and 80 characters.'
    });
  }

  if (
    avatar &&
    (!avatarPattern.test(avatar) ||
      avatar.length > 2800000)
  ) {
    return json(400, {
      error:
        'Use a JPG, PNG, WEBP, or GIF image smaller than 2 MB.'
    });
  }

  const update = {
    name,
    updatedAt: new Date().toISOString()
  };

  if (avatar) update.avatar = avatar;

  await usersCollection.updateOne(
    { _id: auth.user._id },
    { $set: update }
  );

  return json(200, {
    user: {
      name,
      email: auth.user.email,
      avatar:
        avatar ||
        auth.user.avatar ||
        ''
    }
  });
}

async function listSessions(event) {
  const { sessionsCollection } = await getDb();

  const auth = await getAuthenticatedUser(event);

  if (!auth?.user) {
    return json(401, {
      error: 'Please log in again.'
    });
  }

  const sessions =
    await sessionsCollection
      .find({
        userId: auth.userId,
        expiresAt: { $gt: new Date() }
      })
      .sort({ createdAt: -1 })
      .toArray();

  return json(200, {
    sessions: sessions.map((session) => ({
      current:
        session.token === auth.token,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt
    }))
  });
}

async function deleteAccount(event) {
  const { usersCollection, sessionsCollection } =
    await getDb();

  const auth = await getAuthenticatedUser(event);

  if (!auth?.user) {
    return json(401, {
      error: 'Please log in again.'
    });
  }

  const body = getBody(event);

  if (
    String(body.confirmation || '')
      .trim()
      .toUpperCase() !== 'DELETE'
  ) {
    return json(400, {
      error:
        'Type DELETE to confirm account removal.'
    });
  }

  await usersCollection.deleteOne({
    _id: auth.user._id
  });

  await sessionsCollection.deleteMany({
    userId: auth.userId
  });

  return json(
    200,
    { deleted: true },
    {
      'Set-Cookie': clearSessionCookie
    }
  );
}

async function logout(event) {
  const { sessionsCollection } = await getDb();

  const cookies = parseCookies(event);
  const token = cookies.soufiane_session;

  if (token) {
    await sessionsCollection.deleteOne({
      token
    });
  }

  return json(
    200,
    { loggedOut: true },
    {
      'Set-Cookie': clearSessionCookie
    }
  );
}

async function me(event) {
  const { usersCollection } = await getDb();

  const cookies = parseCookies(event);
  const token = cookies.soufiane_session;

  const userId = await getSessionUserId(token);

  if (!userId) {
    return json(401, {
      error: 'Not authenticated.'
    });
  }

  const user = await usersCollection.findOne({
    id: userId
  });

  if (!user) {
    return json(401, {
      error: 'Not authenticated.'
    });
  }

  return json(200, {
    user: {
      name: user.name,
      email: user.email,
      avatar: user.avatar || ''
    }
  });
}

exports.handler = async (event) => {
  try {
    const method = event.httpMethod;
    const rawPath = event.path || (event.rawUrl ? new URL(event.rawUrl).pathname : '');
    const pathname = rawPath.startsWith('/.netlify/functions/api')
      ? `/api${rawPath.replace(/^\/.netlify\/functions\/api/, '')}`
      : rawPath;

    if (
      method === 'POST' &&
      ['/api/auth/signup', '/api/auth/login'].includes(
        pathname
      )
    ) {
      return await handleAuth(event, pathname);
    }

    if (
      method === 'POST' &&
      pathname === '/api/auth/verify'
    ) {
      return await verifyEmail(event);
    }

    if (
      method === 'POST' &&
      pathname === '/api/auth/resend'
    ) {
      return await resendVerification(event);
    }

    if (
      method === 'POST' &&
      pathname === '/api/auth/change-password'
    ) {
      return await changePassword(event);
    }

    if (
      method === 'PATCH' &&
      pathname === '/api/auth/profile'
    ) {
      return await updateProfile(event);
    }

    if (
      method === 'GET' &&
      pathname === '/api/auth/sessions'
    ) {
      return await listSessions(event);
    }

    if (
      method === 'DELETE' &&
      pathname === '/api/auth/account'
    ) {
      return await deleteAccount(event);
    }

    if (
      method === 'POST' &&
      pathname === '/api/auth/logout'
    ) {
      return await logout(event);
    }

    if (
      method === 'GET' &&
      pathname === '/api/auth/me'
    ) {
      return await me(event);
    }

    return json(404, {
      error: 'API route not found.'
    });
  } catch (error) {
    console.error(error);

    return json(500, {
      error:
        process.env.NODE_ENV === 'production'
          ? 'Internal server error.'
          : error.message
    });
  }
};