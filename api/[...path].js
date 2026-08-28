const { handleRequest } = require('../lib/backend');

const getRequestBody = (request) => {
  if (request.body === undefined || request.body === null) return '';
  return typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
};

module.exports = async (request, response) => {
  const requestUrl = new URL(request.url || '/', `https://${request.headers.host || 'localhost'}`);
  const queryStringParameters = Object.fromEntries(requestUrl.searchParams.entries());
  const multiValueQueryStringParameters = Object.fromEntries(
    [...new Set(requestUrl.searchParams.keys())].map((key) => [key, requestUrl.searchParams.getAll(key)])
  );
  const result = await handleRequest({
    method: request.method,
    path: requestUrl.pathname,
    headers: request.headers,
    queryStringParameters,
    multiValueQueryStringParameters,
    body: getRequestBody(request),
    isBase64Encoded: false
  });

  response.status(result.statusCode || 200);
  Object.entries(result.headers || {}).forEach(([name, value]) => response.setHeader(name, value));
  response.send(result.body || '');
};
