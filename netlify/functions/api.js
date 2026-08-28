const { handleRequest } = require('../../lib/backend');

exports.handler = async (event) => {
  const rawPath = event.path || (event.rawUrl ? new URL(event.rawUrl).pathname : '');
  const path = rawPath.startsWith('/.netlify/functions/api')
    ? `/api${rawPath.replace(/^\/.netlify\/functions\/api/, '')}`
    : rawPath;
  const result = await handleRequest({
    method: event.httpMethod,
    path,
    headers: event.headers || {},
    queryStringParameters: event.queryStringParameters || {},
    multiValueQueryStringParameters: event.multiValueQueryStringParameters || {},
    body: event.body || '',
    isBase64Encoded: Boolean(event.isBase64Encoded)
  });
  return result;
};
