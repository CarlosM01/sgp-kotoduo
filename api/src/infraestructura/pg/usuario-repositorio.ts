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
  bloqueado: boolean;
  roles: string[];
}

const SELECT_USUARIO = `
  SELECT u.id, u.nombre_usuario, u.nombre_completo, u.password_hash, u.activo,
         u.debe_cambiar_clave,
         COALESCE(u.bloqueado_hasta > now(), FALSE) AS bloqueado,
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
    bloqueado: f.bloqueado,
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

    async registrarIntentoFallido(id, maxIntentos, minutosBloqueo) {
      // One UPDATE: the row lock serializes concurrent failures, so no attempt is lost.
      // In SET, column references read the values before the update.
      const { rows } = await pool.query<{ bloqueada: boolean }>(
        `UPDATE sgp.usuario
            SET intentos_fallidos = CASE WHEN intentos_fallidos + 1 >= $2 THEN 0
                                         ELSE intentos_fallidos + 1 END,
                bloqueado_hasta   = CASE WHEN intentos_fallidos + 1 >= $2
                                         THEN now() + make_interval(mins => $3::int)
                                         ELSE bloqueado_hasta END,
                actualizado_en    = now()
          WHERE id = $1
            AND (bloqueado_hasta IS NULL OR bloqueado_hasta <= now())
        RETURNING COALESCE(bloqueado_hasta > now(), FALSE) AS bloqueada`,
        [id, maxIntentos, minutosBloqueo],
      );
      return { bloqueada: rows[0]?.bloqueada ?? false };
    },

    async registrarAccesoExitoso(id) {
      await pool.query(
        `UPDATE sgp.usuario
            SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_acceso = now()
          WHERE id = $1`,
        [id],
      );
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
