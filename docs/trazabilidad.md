# Identificadores estables

| Prefijo | Qué identifica | Origen | Ejemplo |
|---|---|---|---|
| `HU-xx` | Historia de usuario | Informe 2 | HU-02 |
| `CU-xx` | Caso de uso | Informe 2 | CU-06 |
| `CP-xx` | Caso de prueba | Informe 2, recortado en `roadmap.md` §5 | CP-12 |
| `AM-xx` | Amenaza (modelo de seguridad) | Informe 2 | AM-05 |
| `DEF-xx` | Defecto encontrado al ejecutar un CP | `evidencias/defectos.md` | DEF-01 |
| `E-xx` | Evidencia (captura, log, reporte) | `evidencias/` | E-03 |
| `DEMO-xx` | Dato de prueba identificable | Seed y fichas | DEMO-01 |

Reglas:

- Los tests nombran el CP que cubren en su descripción: `it('CP-12: terminar etapa habilita la siguiente', ...)`.
- Los commits mencionan la HU o el CP cuando aplica: `feat(api): start/finish stage (HU-02, CP-12)`.
- Un ID nunca se reutiliza, aunque el elemento se excluya.
