// CP-23 (partial): load on GET /panel?filtro=activas&tamano=20 with the
// volume data (about 5,000 orders and 30,000 stages).
//
// ES2: EXPLAIN ANALYZE of the paginated panel and p95 < 300 ms with k6 at 10 VU.
// 10 VU × 20 req/min = 200 req/min, under the API limit of 300 per IP (AM-14).
// One login shared by every VU (the login allows 10 per minute per IP, CP-29).
//
// Run (from the repository root, API up):
//   docker run --rm --network host -v "$PWD/scripts/k6:/k6:ro" \
//     -e BASE_URL=http://127.0.0.1:3000/api/v1 -e USUARIO=encargada \
//     -e CLAVE="kotoduo demo local 2026" -e SOSTENIDO=2m \
//     grafana/k6:1.0.0 run /k6/cp23-panel.js
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:8080/api/v1';
const VUS = Number(__ENV.VUS || 10);

export const options = {
  scenarios: {
    panel: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: VUS },
        { duration: __ENV.SOSTENIDO || '5m', target: VUS },
        { duration: '10s', target: 0 },
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    'http_req_duration{endpoint:panel}': ['p(95)<300'],
    'http_req_failed{endpoint:panel}': ['rate<0.01'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

// One login shared by every VU; the access token lasts 10 min (D14).
export function setup() {
  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ nombreUsuario: __ENV.USUARIO || 'encargada', clave: __ENV.CLAVE }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  if (res.status !== 200) {
    throw new Error(`login failed: HTTP ${res.status} ${res.body}`);
  }
  return { token: res.json('accessToken') };
}

export default function (data) {
  const res = http.get(`${BASE_URL}/panel?filtro=activas&tamano=20`, {
    headers: { Authorization: `Bearer ${data.token}` },
    tags: { endpoint: 'panel' },
  });
  check(res, {
    'status 200': (r) => r.status === 200,
    'trae datos': (r) => Array.isArray(r.json('datos')),
  });
  sleep(3);
}
