import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001/api/v1';

export const options = {
  vus: 10,
  duration: '10s',
  thresholds: {
    http_req_duration: ['p(95)<800'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  // Test de la route GET /api/v1/clients
  const clientsRes = http.get(`${BASE_URL}/clients`);
  check(clientsRes, {
    'clients status 401': (r) => r.status === 401,
  });

  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, {
    'health status 200': (r) => r.status === 200,
  });

  sleep(0.5);
}
