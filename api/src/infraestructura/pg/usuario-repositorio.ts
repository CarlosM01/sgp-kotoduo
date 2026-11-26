// PostgreSQL user repository. Every query is parameterized ($1..$n): values
// never become part of the SQL text (AM-01, CP-24).
import type { Pool } from 'pg';
import type { UsuarioAuth, UsuarioRepositorio } from '../../aplicacion/puertos.js';
import { esCodigoRol } from '../../dominio/permisos.js';

interface FilaUsuario {
  id: string;
  nombre_usuario: string;
  nombre_completo: string;
  password_hash: string;
  activo: boolean;
  debe_cambiar_clave: boolean;
  roles: string[];
}

const SELECT_USUARIO = `
  SELECT u.id, u.nombre_usuario, u.nombre_completo, u.password_hash, u.activo,
         u.debe_cambiar_clave,
         COALESCE(array_agg(r.codigo ORDER BY r.codigo) FILTER (WHERE r.codigo IS NOT NULL), '{}') AS roles
    FROM sgp.usuario u
    LEFT JOIN sgp.usuario_rol ur ON ur.usuario_id = u.id
    LEFT JOIN sgp.rol r          ON r.id = ur.rol_id`;

function aUsuario(f: FilaUsuario): UsuarioAuth {
  return {
    id: f.id,
    nombreUsuario: f.nombre_usuario,
    nombreCompleto: f.nombre_completo,
    passwordHash: f.password_hash,
    activo: f.activo,
    debeCambiarClave: f.debe_cambiar_clave,
    roles: f.roles.filter(esCodigoRol),
  };
}

export function crearUsuarioRepositorioPg(pool: Pool): UsuarioRepositorio {
  return {
    async buscarPorNombre(nombreUsuario) {
      const { rows } = await pool.query<FilaUsuario>(
        `${SELECT_USUARIO} WHERE u.nombre_usuario = $1 GROUP BY u.id`,
        [nombreUsuario],
      );
      return rows[0] ? aUsuario(rows[0]) : null;
    },

    async buscarPorId(id) {
      const { rows } = await pool.query<FilaUsuario>(`${SELECT_USUARIO} WHERE u.id = $1 GROUP BY u.id`, [id]);
      return rows[0] ? aUsuario(rows[0]) : null;
    },

    async listarActivosConRoles(roles) {
      // Only id, name and roles leave the database: never the hash or contact data.
      const { rows } = await pool.query<{ id: string; nombre_completo: string; roles: string[] }>(
        `SELECT u.id, u.nombre_completo, array_agg(r.codigo ORDER BY r.codigo) AS roles
           FROM sgp.usuario u
           JOIN sgp.usuario_rol ur ON ur.usuario_id = u.id
           JOIN sgp.rol r          ON r.id = ur.rol_id
          WHERE u.activo
          GROUP BY u.id
         HAVING bool_or(r.codigo = ANY($1::text[]))
          ORDER BY u.nombre_completo, u.id`,
        // No row cap: the select must list everyone the assignment accepts (review R3-001).
        [roles],
      );
      return rows.map((f) => ({ id: f.id, nombreCompleto: f.nombre_completo, roles: f.roles.filter(esCodigoRol) }));
    },

    async reservarIntento(id, maxIntentos) {
      // Counts the attempt before the password is checked. One UPDATE: the row
      // lock serializes concurrent requests, so at most `maxIntentos` checks run
      // per lock window. A count left at the maximum by a crashed request is
      // treated as stale after one minute without changes.
      const { rowCount } = await pool.query(
        `UPDATE sgp.usuario
            SET intentos_fallidos = CASE WHEN intentos_fallidos >= $2 THEN 1
                                         ELSE intentos_fallidos + 1 END,
                actualizado_en    = now()
          WHERE id = $1
            AND (bloqueado_hasta IS NULL OR bloqueado_hasta <= now())
            AND (intentos_fallidos < $2 OR actualizado_en < now() - interval '1 minute')`,
        [id, maxIntentos],
      );
      return rowCount === 1;
    },

    async registrarFallo(id, maxIntentos, minutosBloqueo) {
      // The reserved attempt stays counted. In SET, column references read the
      // values before the update.
      const { rows } = await pool.query<{ bloqueada: boolean }>(
        `UPDATE sgp.usuario
            SET bloqueado_hasta   = CASE WHEN intentos_fallidos >= $2
                                         THEN now() + make_interval(mins => $3::int)
                                         ELSE bloqueado_hasta END,
                intentos_fallidos = CASE WHEN intentos_fallidos >= $2 THEN 0
                                         ELSE intentos_fallidos END,
                actualizado_en    = now()
          WHERE id = $1
            AND (bloqueado_hasta IS NULL OR bloqueado_hasta <= now())
        RETURNING COALESCE(bloqueado_hasta > now(), FALSE) AS bloqueada`,
        [id, maxIntentos, minutosBloqueo],
      );
      return { bloqueada: rows[0]?.bloqueada ?? false };
    },

    async registrarAccesoExitoso(id) {
      // Conditional: a success that finishes after a concurrent lock does not clear it.
      const { rowCount } = await pool.query(
        `UPDATE sgp.usuario
            SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_acceso = now()
          WHERE id = $1
            AND (bloqueado_hasta IS NULL OR bloqueado_hasta <= now())`,
        [id],
      );
      return rowCount === 1;
    },

    async actualizarClave(id, passwordHash) {
      await pool.query(
        `UPDATE sgp.usuario
            SET password_hash = $2, debe_cambiar_clave = FALSE, actualizado_en = now()
          WHERE id = $1`,
        [id, passwordHash],
      );
    },
  };
}
