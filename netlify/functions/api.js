const { handler: netlifyHandler } = require('../netlify/functions/api');

const getRequestBody = (request) => {
  if (request.body === undefined || request.body === null) return '';

  return typeof request.body === 'string'
    ? request.body
    : JSON.stringify(request.body);
};

module.exports = async (request, response) => {
  const requestUrl = new URL(
    request.url || '/',
    `https://${request.headers.host || 'localhost'}`
  );

  const queryStringParameters = Object.fromEntries(
    requestUrl.searchParams.entries()
  );

  const multiValueQueryStringParameters = Object.fromEntries(
    [...new Set(requestUrl.searchParams.keys())].map((key) => [
      key,
      requestUrl.searchParams.getAll(key)
    ])
  );

  const cookieHeader = request.headers.cookie || '';

  const event = {
    httpMethod: request.method,
    path: requestUrl.pathname,
    headers: request.headers,
    queryStringParameters,
    multiValueQueryStringParameters,
    cookies: request.cookies || {},
    body: getRequestBody(request),
    isBase64Encoded: false
  };

  if (cookieHeader && !event.cookies) {
    event.cookies = cookieHeader;
  }

  const result = await netlifyHandler(event);

  response.status(result.statusCode || 200);

  Object.entries(result.headers || {}).forEach(([name, value]) => {
    response.setHeader(name, value);
  });

  response.send(result.body || '');
};