const express = require('express');
const path = require('path');
const fs = require('fs');
const { run, get, query, initDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cabeceras CORS abiertas para desarrollo e integraciones locales
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Servir la carpeta compilada (client/dist o public/) de forma estática
const distPath = path.resolve(__dirname, '../client/dist');
const publicPath = path.resolve(__dirname, '../public');
const staticPath = fs.existsSync(distPath) ? distPath : publicPath;
app.use(express.static(staticPath));

// Estado del servidor
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// =============================================================================
// 1. ENDPOINTS DE DOCENTES (/api/docentes)
// =============================================================================

// Login o registro automático de docentes
app.post('/api/docentes/login', async (req, res) => {
  try {
    const { nombre, correo, clave } = req.body || {};
    if (!correo || !clave) {
      return res.status(400).json({ error: 'El correo y la contraseña son obligatorios.' });
    }

    const cleanCorreo = correo.trim().toLowerCase();
    const docenteExistente = await get('SELECT * FROM docentes WHERE LOWER(correo) = ?', [cleanCorreo]);

    if (docenteExistente) {
      // Validar clave
      if (docenteExistente.clave !== clave) {
        return res.status(401).json({ error: 'Contraseña incorrecta para esta cuenta docente.' });
      }
      return res.json({
        message: 'Inicio de sesión docente exitoso.',
        docente: {
          id: docenteExistente.id,
          nombre: docenteExistente.nombre,
          correo: docenteExistente.correo
        },
        isNew: false
      });
    }

    // Si no existe, registrar nuevo docente en SQLite
    const cleanNombre = (nombre && nombre.trim()) ? nombre.trim() : 'Docente';
    const result = await run(
      'INSERT INTO docentes (nombre, correo, clave) VALUES (?, ?, ?)',
      [cleanNombre, cleanCorreo, clave]
    );

    return res.status(201).json({
      message: 'Cuenta docente registrada en base de datos.',
      docente: {
        id: result.lastID,
        nombre: cleanNombre,
        correo: cleanCorreo
      },
      isNew: true
    });
  } catch (err) {
    console.error('Error en /api/docentes/login:', err);
    res.status(500).json({ error: 'Error interno del servidor al procesar docente.' });
  }
});

// Listar todos los docentes
app.get('/api/docentes', async (req, res) => {
  try {
    const rows = await query('SELECT id, nombre, correo, fecha_registro FROM docentes ORDER BY id ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener docentes: ' + err.message });
  }
});

// Crear docente manual
app.post('/api/docentes', async (req, res) => {
  try {
    const { nombre, correo, clave } = req.body || {};
    if (!nombre || !correo || !clave) {
      return res.status(400).json({ error: 'Nombre, correo y clave son obligatorios.' });
    }
    const cleanCorreo = correo.trim().toLowerCase();
    const existing = await get('SELECT id FROM docentes WHERE LOWER(correo) = ?', [cleanCorreo]);
    if (existing) {
      return res.status(409).json({ error: 'Ya existe un docente con este correo.' });
    }
    const result = await run(
      'INSERT INTO docentes (nombre, correo, clave) VALUES (?, ?, ?)',
      [nombre.trim(), cleanCorreo, clave]
    );
    res.status(201).json({
      id: result.lastID,
      message: 'Docente registrado exitosamente.',
      docente: { id: result.lastID, nombre: nombre.trim(), correo: cleanCorreo }
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al registrar docente: ' + err.message });
  }
});

// Eliminar docente
app.delete('/api/docentes/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await run('DELETE FROM docentes WHERE id = ?', [id]);
    res.json({ message: 'Docente eliminado correctamente.', id });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar docente: ' + err.message });
  }
});

// =============================================================================
// 2. ENDPOINTS DE ESTUDIANTES (/api/estudiantes)
// =============================================================================

// Listar todos los estudiantes
app.get('/api/estudiantes', async (req, res) => {
  try {
    const rows = await query('SELECT id, nombres, apellidos, cedula, correo, fecha_registro FROM estudiantes ORDER BY id DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener estudiantes: ' + err.message });
  }
});

// Registro de estudiantes (admite POST a /api/estudiantes y /api/estudiantes/registro)
const registrarEstudianteHandler = async (req, res) => {
  try {
    const { nombres, apellidos, cedula, correo } = req.body || {};
    if (!nombres || !apellidos || !cedula || !correo) {
      return res.status(400).json({ error: 'Todos los campos son obligatorios (nombres, apellidos, cédula, correo).' });
    }

    const cleanCedula = cedula.trim();
    const cleanCorreo = correo.trim().toLowerCase();

    // Validar duplicados en SQLite
    const existing = await get(
      'SELECT id, cedula, correo FROM estudiantes WHERE cedula = ? OR LOWER(correo) = ?',
      [cleanCedula, cleanCorreo]
    );

    if (existing) {
      return res.status(409).json({ error: 'Ya existe un estudiante registrado con esa cédula o correo.' });
    }

    const result = await run(
      'INSERT INTO estudiantes (nombres, apellidos, cedula, correo) VALUES (?, ?, ?, ?)',
      [nombres.trim(), apellidos.trim(), cleanCedula, cleanCorreo]
    );

    const nuevoEstudiante = {
      id: result.lastID,
      nombres: nombres.trim(),
      apellidos: apellidos.trim(),
      cedula: cleanCedula,
      correo: cleanCorreo
    };

    res.status(201).json({
      message: 'Estudiante guardado en base de datos.',
      id: result.lastID,
      estudiante: nuevoEstudiante
    });
  } catch (err) {
    console.error('Error al registrar estudiante:', err);
    res.status(500).json({ error: 'Error interno al registrar estudiante: ' + err.message });
  }
};

app.post('/api/estudiantes', registrarEstudianteHandler);
app.post('/api/estudiantes/registro', registrarEstudianteHandler);

// Login / búsqueda de estudiante por cédula o correo
app.post('/api/estudiantes/login', async (req, res) => {
  try {
    const { identificador } = req.body || {};
    if (!identificador) {
      return res.status(400).json({ error: 'Identificador (cédula o correo) requerido.' });
    }
    const cleanIdent = identificador.trim().toLowerCase();
    const estudiante = await get(
      'SELECT id, nombres, apellidos, cedula, correo, fecha_registro FROM estudiantes WHERE cedula = ? OR LOWER(correo) = ?',
      [cleanIdent, cleanIdent]
    );

    if (!estudiante) {
      return res.status(404).json({ error: 'Estudiante no encontrado. Regístralo primero.' });
    }

    res.json({ message: 'Estudiante autenticado con éxito.', estudiante });
  } catch (err) {
    res.status(500).json({ error: 'Error al buscar estudiante: ' + err.message });
  }
});

// Eliminar estudiante
app.delete('/api/estudiantes/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await run('DELETE FROM estudiantes WHERE id = ?', [id]);
    res.json({ message: 'Estudiante eliminado', id });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar estudiante: ' + err.message });
  }
});

// =============================================================================
// 3. ENDPOINTS DE PREGUNTAS (/api/preguntas)
// =============================================================================

// Listar preguntas (opcional filtro por ?materia=...)
app.get('/api/preguntas', async (req, res) => {
  try {
    const { materia } = req.query;
    let rows;
    if (materia && materia !== 'TODAS') {
      rows = await query('SELECT * FROM preguntas WHERE materia = ? ORDER BY id ASC', [materia]);
    } else {
      rows = await query('SELECT * FROM preguntas ORDER BY id ASC');
    }
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener preguntas: ' + err.message });
  }
});

// Guardar una pregunta individual
app.post('/api/preguntas', async (req, res) => {
  try {
    const { materia, enunciado, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta } = req.body || {};
    if (!materia || !enunciado || !opcion_a || !opcion_b || !opcion_c || !opcion_d || !respuesta_correcta) {
      return res.status(400).json({ error: 'Todos los campos de la pregunta son requeridos.' });
    }

    const result = await run(
      `INSERT INTO preguntas (materia, enunciado, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        materia.trim(),
        enunciado.trim(),
        opcion_a.trim(),
        opcion_b.trim(),
        opcion_c.trim(),
        opcion_d.trim(),
        respuesta_correcta.trim().toUpperCase()
      ]
    );

    const nuevaPregunta = {
      id: result.lastID,
      materia: materia.trim(),
      enunciado: enunciado.trim(),
      opcion_a: opcion_a.trim(),
      opcion_b: opcion_b.trim(),
      opcion_c: opcion_c.trim(),
      opcion_d: opcion_d.trim(),
      respuesta_correcta: respuesta_correcta.trim().toUpperCase()
    };

    res.status(201).json({
      message: 'Pregunta guardada en base de datos.',
      id: result.lastID,
      pregunta: nuevaPregunta
    });
  } catch (err) {
    console.error('Error al guardar pregunta:', err);
    res.status(500).json({ error: 'Error al guardar la pregunta: ' + err.message });
  }
});

// Guardar preguntas masivamente (Aiken o JSON)
app.post('/api/preguntas/bulk', async (req, res) => {
  try {
    const preguntas = Array.isArray(req.body) ? req.body : (req.body.preguntas || []);
    if (!Array.isArray(preguntas) || preguntas.length === 0) {
      return res.status(400).json({ error: 'No se enviaron preguntas válidas para inserción masiva.' });
    }

    let insertCount = 0;
    for (const q of preguntas) {
      if (q.materia && q.enunciado && q.opcion_a && q.opcion_b && q.opcion_c && q.opcion_d && q.respuesta_correcta) {
        await run(
          `INSERT INTO preguntas (materia, enunciado, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            q.materia.trim(),
            q.enunciado.trim(),
            q.opcion_a.trim(),
            q.opcion_b.trim(),
            q.opcion_c.trim(),
            q.opcion_d.trim(),
            q.respuesta_correcta.trim().toUpperCase()
          ]
        );
        insertCount++;
      }
    }

    res.status(201).json({
      message: `Se guardaron ${insertCount} preguntas con éxito.`,
      count: insertCount
    });
  } catch (err) {
    console.error('Error en carga masiva de preguntas:', err);
    res.status(500).json({ error: 'Error al procesar preguntas masivas: ' + err.message });
  }
});

// Eliminar una pregunta por ID
app.delete('/api/preguntas/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await run('DELETE FROM preguntas WHERE id = ?', [id]);
    res.json({ message: 'Pregunta eliminada de base de datos.', id });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar pregunta: ' + err.message });
  }
});

// =============================================================================
// 4. ENDPOINTS DE RESULTADOS DE PARTIDAS (/api/resultados)
// =============================================================================
app.get('/api/resultados', async (req, res) => {
  try {
    const rows = await query(`
      SELECT r.*, e.nombres, e.apellidos, e.cedula, e.correo
      FROM resultados_partidas r
      JOIN estudiantes e ON r.estudiante_id = e.id
      ORDER BY r.id DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener resultados: ' + err.message });
  }
});

app.post('/api/resultados', async (req, res) => {
  try {
    const { estudiante_id, materia, aciertos, fallos, puntaje_final, gano } = req.body || {};
    const result = await run(
      `INSERT INTO resultados_partidas (estudiante_id, materia, aciertos, fallos, puntaje_final, gano)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [estudiante_id, materia, aciertos || 0, fallos || 0, puntaje_final || 0, gano ? 1 : 0]
    );
    res.status(201).json({ message: 'Resultado registrado', id: result.lastID });
  } catch (err) {
    res.status(500).json({ error: 'Error al guardar resultado: ' + err.message });
  }
});

// Middleware de respaldo para servir index.html en cualquier ruta frontend
app.use((req, res) => {
  res.sendFile(path.resolve(staticPath, 'index.html'));
});

module.exports = app;

if (require.main === module) {
  // Inicializar la base de datos y arrancar el servidor
  initDatabase()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`🚀 Servidor de Parchís Educativo iniciado con éxito.`);
        console.log(`🌐 Accede a la aplicación en: http://localhost:${PORT}`);
      });
    })
    .catch((err) => {
      console.error('❌ Error fatal al inicializar la base de datos SQLite:', err);
      process.exit(1);
    });
}
