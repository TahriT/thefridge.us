// Cloudflare Pages Function to proxy API requests to backend
export async function onRequest(context) {
  const { request, env } = context;
  
  // Get the backend URL from environment variable or use default
  const BACKEND_URL = env.BACKEND_URL || 'http://localhost:3000';
  
  // Construct the backend URL with the path
  const url = new URL(request.url);
  const backendUrl = `${BACKEND_URL}${url.pathname}${url.search}`;
  
  // Forward the request to the backend
  const response = await fetch(backendUrl, {
    method: request.method,
    headers: request.headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.arrayBuffer() : undefined,
  });
  
  // Return the response
  return response;
}
