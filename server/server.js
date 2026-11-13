const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const { run, get, query, initDatabase } = require('./database');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

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

// =============================================================================
// 5. MOTOR MULTIJUGADOR EN TIEMPO REAL CON SALAS PRIVADAS (SOCKET.IO)
// =============================================================================
const PLAYER_COLORS = [
  { id: 'yellow', name: 'Amarillo', bg: 'bg-amber-400', border: 'border-amber-400', startCell: 5 },
  { id: 'blue', name: 'Azul', bg: 'bg-blue-600', border: 'border-blue-500', startCell: 22 },
  { id: 'red', name: 'Rojo', bg: 'bg-rose-600', border: 'border-rose-500', startCell: 39 },
  { id: 'green', name: 'Verde', bg: 'bg-emerald-600', border: 'border-emerald-500', startCell: 56 }
];

const SAFE_CELLS = new Set([5, 12, 17, 22, 29, 34, 39, 46, 51, 56, 63, 68]);

// Almacén en memoria de salas privadas
const salas = {};

function generarCodigoSala() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let codigo = '';
  let intentos = 0;
  do {
    codigo = '';
    for (let i = 0; i < 6; i++) {
      codigo += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    intentos++;
    if (intentos > 1000) break;
  } while (salas[codigo]);
  return codigo;
}

// Helpers del motor del juego en el servidor
function isBarrierAtServer(gameState, trackPos) {
  return gameState.players.some(p =>
    p.tokens.filter(t => t.state === 'track' && t.pos === trackPos).length >= 2
  );
}

function pathBlockedByBarrierServer(gameState, playerIdx, currentSteps, roll) {
  const startCell = gameState.players[playerIdx].color.startCell;
  for (let s = 1; s <= roll; s++) {
    const stepCheck = currentSteps + s;
    if (stepCheck <= 63) {
      const trackPos = ((startCell - 1 + stepCheck) % 68) + 1;
      if (isBarrierAtServer(gameState, trackPos)) return true;
    }
  }
  return false;
}

function getValidTokensForMoveServer(gameState, playerIdx, roll) {
  const player = gameState.players[playerIdx];
  const tokensOnStart = player.tokens.filter(t => t.state === 'track' && t.pos === player.color.startCell).length;

  if (roll === 6) {
    const barrierTokens = [];
    player.tokens.forEach((t, idx) => {
      if (t.state === 'track') {
        const sameCellCount = player.tokens.filter(other => other.state === 'track' && other.pos === t.pos).length;
        if (sameCellCount >= 2 && !pathBlockedByBarrierServer(gameState, playerIdx, t.steps, roll)) {
          barrierTokens.push(idx);
        }
      }
    });
    if (barrierTokens.length > 0) return barrierTokens;
  }

  const valid = [];
  player.tokens.forEach((token, idx) => {
    if (token.state === 'goal') return;

    if (token.state === 'home') {
      if ((roll === 5 || roll === 6) && tokensOnStart < 2) {
        valid.push(idx);
      }
      return;
    }

    if (!pathBlockedByBarrierServer(gameState, playerIdx, token.steps, roll)) {
      const targetSteps = token.steps + roll;
      if (targetSteps >= 71) {
        // Regla corregida: llegada a la meta sin rebote
        valid.push(idx);
      } else if (targetSteps <= 63) {
        const destPos = ((player.color.startCell - 1 + targetSteps) % 68) + 1;
        const totalAtDest = gameState.players.reduce((acc, p) =>
          acc + p.tokens.filter(t => t.state === 'track' && t.pos === destPos).length, 0);
        if (totalAtDest < 2) valid.push(idx);
      } else {
        valid.push(idx);
      }
    }
  });

  return valid;
}

function advanceTurnServer(gameState, advancePlayer = true) {
  if (advancePlayer) {
    gameState.turnIdx = (gameState.turnIdx + 1) % gameState.players.length;
    gameState.consecutiveSixes = 0;
    gameState.lastMovedTokenIdx = null;
  }
  gameState.diceValue = null;
  gameState.phase = 'ROLL';
  gameState.pendingMove = null;
}

function manejarSalidaDeSala(socket) {
  const codigo = socket.codigoSalaActual;
  if (!codigo || !salas[codigo]) return;

  const sala = salas[codigo];
  const idx = sala.jugadores.findIndex(j => j.socketId === socket.id);
  if (idx !== -1) {
    const jugadorQueSale = sala.jugadores[idx];
    socket.leave(codigo);
    socket.codigoSalaActual = null;

    if (sala.estado === 'esperando') {
      sala.jugadores.splice(idx, 1);
      // Reasignar colores y anfitrión ordenadamente
      sala.jugadores.forEach((j, i) => {
        j.color = PLAYER_COLORS[i];
        j.esHost = (i === 0);
      });
      if (sala.jugadores.length === 0) {
        delete salas[codigo];
      } else {
        sala.hostSocketId = sala.jugadores[0].socketId;
        io.to(codigo).emit('actualizar-sala', sala);
        io.to(codigo).emit('jugador-desconectado', {
          mensaje: `${jugadorQueSale.student.nombres} salió de la sala.`,
          sala
        });
      }
    } else {
      io.to(codigo).emit('jugador-desconectado', {
        mensaje: `${jugadorQueSale.student.nombres} se ha desconectado.`,
        jugador: jugadorQueSale
      });
    }
  }
}

// Configuración de eventos de WebSocket
io.on('connection', (socket) => {
  console.log(`🔌 Cliente conectado a Socket.io: ${socket.id}`);

  // 1. Crear Sala Privada
  socket.on('crear-sala', (data, callback) => {
    try {
      const { estudiante, materia } = data || {};
      if (!estudiante || !estudiante.cedula) {
        const err = { error: 'Se requieren los datos del estudiante para crear la sala.' };
        if (typeof callback === 'function') callback(err);
        return socket.emit('error-sala', err);
      }

      // Si ya estaba en otra sala, salir
      if (socket.codigoSalaActual) {
        manejarSalidaDeSala(socket);
      }

      const codigo = generarCodigoSala();
      const nuevaSala = {
        codigo,
        materia: materia || 'TODAS',
        hostSocketId: socket.id,
        estado: 'esperando',
        jugadores: [
          {
            socketId: socket.id,
            student: estudiante,
            color: PLAYER_COLORS[0],
            esHost: true
          }
        ],
        gameState: null
      };

      salas[codigo] = nuevaSala;
      socket.join(codigo);
      socket.codigoSalaActual = codigo;

      const resp = { codigo, sala: nuevaSala };
      if (typeof callback === 'function') callback(resp);
      socket.emit('sala-creada', resp);
      io.to(codigo).emit('actualizar-sala', nuevaSala);
      console.log(`🎮 Sala creada: ${codigo} por ${estudiante.nombres}`);
    } catch (e) {
      console.error('Error al crear sala:', e);
      if (typeof callback === 'function') callback({ error: e.message });
      socket.emit('error-sala', { error: e.message });
    }
  });

  // 2. Unirse a Sala Privada
  socket.on('unirse-sala', (data, callback) => {
    try {
      let { codigo, estudiante } = data || {};
      if (!codigo || !estudiante || !estudiante.cedula) {
        const err = { error: 'Código de sala y datos del estudiante requeridos.' };
        if (typeof callback === 'function') callback(err);
        return socket.emit('error-sala', err);
      }

      codigo = codigo.trim().toUpperCase();
      const sala = salas[codigo];

      if (!sala) {
        const err = { error: `La sala con código "${codigo}" no existe.` };
        if (typeof callback === 'function') callback(err);
        return socket.emit('error-sala', err);
      }

      if (sala.estado !== 'esperando') {
        const err = { error: 'Esta partida ya ha comenzado o ha finalizado.' };
        if (typeof callback === 'function') callback(err);
        return socket.emit('error-sala', err);
      }

      // Re-conexión del mismo estudiante (por cédula)
      const indexExistente = sala.jugadores.findIndex(j => j.student.cedula === estudiante.cedula);
      if (indexExistente !== -1) {
        sala.jugadores[indexExistente].socketId = socket.id;
        socket.join(codigo);
        socket.codigoSalaActual = codigo;
        const resp = { codigo, sala, jugador: sala.jugadores[indexExistente] };
        if (typeof callback === 'function') callback(resp);
        socket.emit('sala-unida', resp);
        io.to(codigo).emit('actualizar-sala', sala);
        return;
      }

      if (sala.jugadores.length >= 4) {
        const err = { error: 'La sala ya alcanzó el cupo máximo de 4 estudiantes.' };
        if (typeof callback === 'function') callback(err);
        return socket.emit('error-sala', err);
      }

      const colorAsignado = PLAYER_COLORS[sala.jugadores.length];
      const nuevoJugador = {
        socketId: socket.id,
        student: estudiante,
        color: colorAsignado,
        esHost: false
      };

      sala.jugadores.push(nuevoJugador);
      socket.join(codigo);
      socket.codigoSalaActual = codigo;

      const resp = { codigo, sala, jugador: nuevoJugador };
      if (typeof callback === 'function') callback(resp);
      socket.emit('sala-unida', resp);
      io.to(codigo).emit('actualizar-sala', sala);
      console.log(`👤 ${estudiante.nombres} se unió a la sala ${codigo} (${sala.jugadores.length}/4)`);
    } catch (e) {
      console.error('Error al unirse a sala:', e);
      if (typeof callback === 'function') callback({ error: e.message });
      socket.emit('error-sala', { error: e.message });
    }
  });

  // 3. Iniciar Partida Online (solo anfitrión)
  socket.on('iniciar-partida-online', async (data) => {
    try {
      const codigo = (data && data.codigo) ? data.codigo.trim().toUpperCase() : socket.codigoSalaActual;
      const sala = salas[codigo];
      if (!sala) return socket.emit('error-sala', { error: 'Sala no encontrada.' });

      if (sala.hostSocketId !== socket.id) {
        return socket.emit('error-sala', { error: 'Solo el anfitrión puede iniciar la partida.' });
      }

      if (sala.jugadores.length < 2 || sala.jugadores.length > 4) {
        return socket.emit('error-sala', { error: 'Se requieren entre 2 y 4 jugadores para iniciar.' });
      }

      let preguntas = [];
      if (sala.materia && sala.materia !== 'TODAS') {
        preguntas = await query('SELECT * FROM preguntas WHERE materia = ?', [sala.materia]);
      }
      if (!preguntas || preguntas.length === 0) {
        preguntas = await query('SELECT * FROM preguntas');
      }

      if (!preguntas || preguntas.length === 0) {
        return socket.emit('error-sala', { error: 'No hay preguntas disponibles en la base de datos para iniciar.' });
      }

      // Repetición cíclica de preguntas en los 68 casilleros
      const shuffled = [...preguntas].sort(() => Math.random() - 0.5);
      const boardQuestions = {};
      for (let cell = 1; cell <= 68; cell++) {
        boardQuestions[cell] = shuffled[(cell - 1) % shuffled.length];
      }

      sala.estado = 'jugando';
      sala.gameState = {
        active: true,
        materia: sala.materia === 'TODAS' ? 'Todas las materias' : sala.materia,
        boardQuestions,
        materiaQuestions: shuffled,
        players: sala.jugadores.map(j => ({
          socketId: j.socketId,
          student: j.student,
          color: j.color,
          tokens: [0, 1, 2, 3].map(id => ({ id, state: 'home', pos: 0, steps: 0 }))
        })),
        turnIdx: 0,
        consecutiveSixes: 0,
        lastMovedTokenIdx: null,
        diceValue: null,
        phase: 'ROLL',
        pendingMove: null
      };

      io.to(codigo).emit('partida-iniciada', {
        codigo,
        sala,
        gameState: sala.gameState,
        logMsg: `¡Partida multijugador iniciada con ${sala.jugadores.length} estudiantes!`
      });
      console.log(`🚀 Partida online iniciada en sala ${codigo}`);
    } catch (e) {
      console.error('Error al iniciar partida online:', e);
      socket.emit('error-sala', { error: e.message });
    }
  });

  // 4. Lanzar Dado Online
  socket.on('lanzar-dado', (data) => {
    try {
      const codigo = (data && data.codigo) ? data.codigo.trim().toUpperCase() : socket.codigoSalaActual;
      const sala = salas[codigo];
      if (!sala || !sala.gameState || sala.estado !== 'jugando') return;

      const gs = sala.gameState;
      const currentPlayer = gs.players[gs.turnIdx];

      if (currentPlayer.socketId !== socket.id) {
        return socket.emit('error-juego', { error: 'No es tu turno de lanzar el dado.' });
      }
      if (gs.phase !== 'ROLL') {
        return socket.emit('error-juego', { error: 'No se puede lanzar el dado en este momento.' });
      }

      const roll = Math.floor(Math.random() * 6) + 1;
      gs.diceValue = roll;
      const logRoll = `${currentPlayer.student.nombres} (${currentPlayer.color.name}) sacó ${roll}.`;

      // Regla de tres 6 consecutivos
      if (roll === 6) {
        gs.consecutiveSixes += 1;
        if (gs.consecutiveSixes === 3) {
          if (gs.lastMovedTokenIdx !== null) {
            const t = currentPlayer.tokens[gs.lastMovedTokenIdx];
            if (t && t.state !== 'goal') {
              t.state = 'home';
              t.pos = 0;
              t.steps = 0;
            }
          }
          advanceTurnServer(gs, true);
          io.to(codigo).emit('dado-lanzado', {
            roll,
            tripleSix: true,
            gameState: gs,
            logMsg: `¡Tres 6 seguidos! La última ficha de ${currentPlayer.student.nombres} vuelve a casa y pasa el turno.`
          });
          return;
        }
      } else {
        gs.consecutiveSixes = 0;
      }

      const validTokens = getValidTokensForMoveServer(gs, gs.turnIdx, roll);

      if (validTokens.length === 0) {
        advanceTurnServer(gs, roll !== 6);
        io.to(codigo).emit('dado-lanzado', {
          roll,
          validTokens: [],
          sinMovimientos: true,
          gameState: gs,
          logMsg: `${logRoll} Sin movimientos posibles. Pasa el turno.`
        });
      } else {
        gs.phase = 'SELECT_TOKEN';
        io.to(codigo).emit('dado-lanzado', {
          roll,
          validTokens,
          gameState: gs,
          logMsg: `${logRoll} Elige cualquiera de tus fichas iluminadas.`
        });
      }
    } catch (e) {
      console.error('Error en lanzar-dado:', e);
    }
  });

  // 5. Mover Ficha Online
  socket.on('mover-ficha', (data) => {
    try {
      const codigo = (data && data.codigo) ? data.codigo.trim().toUpperCase() : socket.codigoSalaActual;
      const { tokenIdx } = data || {};
      const sala = salas[codigo];
      if (!sala || !sala.gameState || sala.estado !== 'jugando') return;

      const gs = sala.gameState;
      const currentPlayer = gs.players[gs.turnIdx];

      if (currentPlayer.socketId !== socket.id) {
        return socket.emit('error-juego', { error: 'No es tu turno.' });
      }
      if (gs.phase !== 'SELECT_TOKEN') {
        return socket.emit('error-juego', { error: 'Fase de juego no válida.' });
      }

      const validTokens = getValidTokensForMoveServer(gs, gs.turnIdx, gs.diceValue);
      if (!validTokens.includes(tokenIdx)) {
        return socket.emit('error-juego', { error: 'Movimiento no permitido para esa ficha.' });
      }

      gs.lastMovedTokenIdx = tokenIdx;
      const token = currentPlayer.tokens[tokenIdx];
      const roll = gs.diceValue;

      const prevState = token.state;
      const prevPos = token.pos;
      const prevSteps = token.steps;

      if (token.state === 'home' && (roll === 5 || roll === 6)) {
        token.state = 'track';
        token.steps = 0;
        token.pos = currentPlayer.color.startCell;
      } else {
        const currentSteps = token.steps + roll;
        if (currentSteps >= 71) {
          // Regla sin rebote: entra directamente a meta
          token.steps = 71;
          token.state = 'goal';
          token.pos = 8;
        } else if (currentSteps > 63) {
          token.steps = currentSteps;
          token.state = 'final';
          token.pos = currentSteps - 63;
        } else {
          token.steps = currentSteps;
          token.state = 'track';
          token.pos = ((currentPlayer.color.startCell - 1 + currentSteps) % 68) + 1;
        }
      }

      // Si llegó a la meta
      if (token.state === 'goal') {
        if (currentPlayer.tokens.every(t => t.state === 'goal')) {
          gs.phase = 'FINISHED';
          sala.estado = 'finalizada';
          io.to(codigo).emit('partida-finalizada', {
            ganador: currentPlayer,
            gameState: gs,
            logMsg: `🎉 ¡${currentPlayer.student.nombres} ${currentPlayer.student.apellidos} ha ganado la partida!`
          });
          return;
        }

        advanceTurnServer(gs, roll !== 6);
        io.to(codigo).emit('estado-tablero-actualizado', {
          gameState: gs,
          tokenMovido: { playerIdx: gs.turnIdx, tokenIdx },
          logMsg: `¡${currentPlayer.student.nombres} llevó una ficha a la META!`
        });
        return;
      }

      // Verificar si cae sobre ficha rival fuera de seguro
      let capturedTarget = null;
      if (token.state === 'track' && !SAFE_CELLS.has(token.pos)) {
        for (let rIdx = 0; rIdx < gs.players.length; rIdx++) {
          if (rIdx === gs.turnIdx) continue;
          const rival = gs.players[rIdx];
          const rivalTokenIdx = rival.tokens.findIndex(t => t.state === 'track' && t.pos === token.pos);
          if (rivalTokenIdx !== -1) {
            capturedTarget = { playerIdx: rIdx, tokenIdx: rivalTokenIdx };
            break;
          }
        }
      }

      const question = token.state === 'track'
        ? gs.boardQuestions[token.pos]
        : gs.materiaQuestions[Math.floor(Math.random() * gs.materiaQuestions.length)];

      gs.phase = 'QUESTION';
      gs.pendingMove = {
        playerIdx: gs.turnIdx,
        tokenIdx,
        prevState,
        prevPos,
        prevSteps,
        newState: token.state,
        newPos: token.pos,
        newSteps: token.steps,
        capturedTarget,
        rolledSix: roll === 6,
        question
      };

      io.to(codigo).emit('mostrar-pregunta', {
        question,
        isCapture: Boolean(capturedTarget),
        playerIdx: gs.turnIdx,
        playerName: currentPlayer.student.nombres,
        gameState: gs,
        logMsg: capturedTarget
          ? `⚔️ ¡${currentPlayer.student.nombres} debe responder la pregunta para comerse la ficha!`
          : `📝 Pregunta para ${currentPlayer.student.nombres} en casillero #${token.pos}.`
      });
    } catch (e) {
      console.error('Error en mover-ficha:', e);
    }
  });

  // 6. Responder Pregunta Online
  socket.on('responder-pregunta', (data) => {
    try {
      const codigo = (data && data.codigo) ? data.codigo.trim().toUpperCase() : socket.codigoSalaActual;
      const { selectedKey } = data || {};
      const sala = salas[codigo];
      if (!sala || !sala.gameState || sala.estado !== 'jugando') return;

      const gs = sala.gameState;
      const move = gs.pendingMove;
      if (!move || gs.phase !== 'QUESTION') return;

      const currentPlayer = gs.players[move.playerIdx];
      if (currentPlayer.socketId !== socket.id) {
        return socket.emit('error-juego', { error: 'Solo el jugador en turno puede responder.' });
      }

      const correctKey = move.question.respuesta_correcta.trim().toUpperCase();
      const isCorrect = (String(selectedKey).trim().toUpperCase() === correctKey);
      const token = currentPlayer.tokens[move.tokenIdx];

      let feedback = '';
      let logMsg = '';

      if (isCorrect) {
        if (move.capturedTarget) {
          const rival = gs.players[move.capturedTarget.playerIdx];
          const rivalToken = rival.tokens[move.capturedTarget.tokenIdx];
          rivalToken.state = 'home';
          rivalToken.pos = 0;
          rivalToken.steps = 0;

          const bonusSteps = Math.min(71, token.steps + 20);
          token.steps = bonusSteps;
          if (bonusSteps === 71) { token.state = 'goal'; token.pos = 8; }
          else if (bonusSteps > 63) { token.state = 'final'; token.pos = bonusSteps - 63; }
          else { token.state = 'track'; token.pos = ((currentPlayer.color.startCell - 1 + bonusSteps) % 68) + 1; }

          feedback = `¡Correcto! Comiste la ficha de ${rival.student.nombres} y avanzas 20 casillas extra.`;
          logMsg = `¡${currentPlayer.student.nombres} acertó, se comió a ${rival.student.nombres} y sumó 20 casillas!`;
        } else {
          feedback = '¡Correcto! Conservas este casillero.';
          logMsg = `${currentPlayer.student.nombres} acertó la pregunta y aseguró su casillero.`;
        }
      } else {
        token.state = move.prevState;
        token.pos = move.prevPos;
        token.steps = move.prevSteps;
        feedback = `Incorrecto (era ${correctKey}). Regresas a tu posición anterior.`;
        logMsg = `${currentPlayer.student.nombres} respondió incorrectamente y regresó a su posición anterior.`;
      }

      // Verificar si con el avance (+20) alcanzó la meta con todas las fichas
      if (currentPlayer.tokens.every(t => t.state === 'goal')) {
        gs.phase = 'FINISHED';
        sala.estado = 'finalizada';
        io.to(codigo).emit('pregunta-respondida', {
          isCorrect,
          selectedKey,
          correctKey,
          feedback,
          gameState: gs,
          logMsg
        });
        setTimeout(() => {
          io.to(codigo).emit('partida-finalizada', {
            ganador: currentPlayer,
            gameState: gs,
            logMsg: `🎉 ¡${currentPlayer.student.nombres} ${currentPlayer.student.apellidos} ha ganado la partida!`
          });
        }, 1800);
        return;
      }

      const advance = !(isCorrect && move.rolledSix);
      advanceTurnServer(gs, advance);

      io.to(codigo).emit('pregunta-respondida', {
        isCorrect,
        selectedKey,
        correctKey,
        feedback,
        gameState: gs,
        logMsg
      });
    } catch (e) {
      console.error('Error en responder-pregunta:', e);
    }
  });

  // 7. Salir de Sala
  socket.on('salir-sala', () => {
    manejarSalidaDeSala(socket);
  });

  // 8. Desconexión
  socket.on('disconnect', () => {
    console.log(`🔌 Cliente desconectado de Socket.io: ${socket.id}`);
    manejarSalidaDeSala(socket);
  });
});

// Endpoint opcional para consultar estado de una sala
app.get('/api/salas/:codigo', (req, res) => {
  const codigo = (req.params.codigo || '').toUpperCase();
  const sala = salas[codigo];
  if (!sala) return res.status(404).json({ error: 'Sala no encontrada' });
  res.json({
    codigo: sala.codigo,
    materia: sala.materia,
    estado: sala.estado,
    totalJugadores: sala.jugadores.length,
    jugadores: sala.jugadores.map(j => ({
      nombres: j.student.nombres,
      apellidos: j.student.apellidos,
      color: j.color.name,
      esHost: j.esHost
    }))
  });
});

// Middleware de respaldo para servir index.html en cualquier ruta frontend
app.use((req, res) => {
  res.sendFile(path.resolve(staticPath, 'index.html'));
});

module.exports = { app, server, io };

if (require.main === module) {
  // Inicializar la base de datos y arrancar el servidor HTTP + Socket.io
  initDatabase()
    .then(() => {
      server.listen(PORT, () => {
        console.log(`🚀 Servidor de Parchís Educativo iniciado con éxito.`);
        console.log(`🌐 Accede a la aplicación en: http://localhost:${PORT}`);
        console.log(`⚡ WebSocket Socket.io activo para Multijugador Online en tiempo real.`);
      });
    })
    .catch((err) => {
      console.error('❌ Error fatal al inicializar la base de datos SQLite:', err);
      process.exit(1);
    });
}
