// CP-20 (reduced): load on GET /mi-trabajo, run locally against the Docker stack.
//
// ES2: ramp 0→40 VU in 1 min, 5 min sustained, one request every 3 s per VU,
// thresholds p95 < 500 ms, p99 < 1 s, errors < 1 %.
// MVP reduction (roadmap §5.1): every VU leaves from the same IP, and the API
// limits each IP to 300 requests per minute (AM-14). 12 VU × 20 req/min =
// 240 req/min stays under that limit; 40 VU from one address would only
// measure the limiter answering 429.
//
// Run (from the repository root, stack up):
//   docker run --rm --network host -v "$PWD/scripts/k6:/k6" \
//     -e BASE_URL=http://127.0.0.1:8080/api/v1 -e USUARIO=operario \
//     -e CLAVE="kotoduo demo local 2026" \
//     grafana/k6:1.0.0 run /k6/cp20-mi-trabajo.js
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:8080/api/v1';
const VUS = Number(__ENV.VUS || 12);

export const options = {
  scenarios: {
    mi_trabajo: {
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
    'http_req_duration{endpoint:mi-trabajo}': ['p(95)<500', 'p(99)<1000'],
    'http_req_failed{endpoint:mi-trabajo}': ['rate<0.01'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

// One login shared by every VU: the login route allows 10 attempts per minute
// per IP (CP-29), and the access token lasts 10 min (D14), longer than the run.
export function setup() {
  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ nombreUsuario: __ENV.USUARIO || 'operario', clave: __ENV.CLAVE }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  if (res.status !== 200) {
    throw new Error(`login failed: HTTP ${res.status} ${res.body}`);
  }
  return { token: res.json('accessToken') };
}

export default function (data) {
  const res = http.get(`${BASE_URL}/mi-trabajo`, {
    headers: { Authorization: `Bearer ${data.token}` },
    tags: { endpoint: 'mi-trabajo' },
  });
  check(res, {
    'status 200': (r) => r.status === 200,
    'trae etapas': (r) => Array.isArray(r.json('etapas')),
  });
  sleep(3);
}
