const path = require('path');
const fs = require('fs');

// Ruta persistente del archivo database.sqlite en la raíz del proyecto
const DB_PATH = path.resolve(__dirname, '../database.sqlite');

// Preguntas educativas por defecto
const DEFAULT_PREGUNTAS = [
  { id: 1, materia: 'Cultura General', enunciado: '¿Cuál es el planeta más grande del sistema solar?', opcion_a: 'Marte', opcion_b: 'Júpiter', opcion_c: 'Saturno', opcion_d: 'Neptuno', respuesta_correcta: 'B' },
  { id: 2, materia: 'Matemáticas', enunciado: '¿Cuánto es 8 x 7?', opcion_a: '54', opcion_b: '64', opcion_c: '56', opcion_d: '48', respuesta_correcta: 'C' },
  { id: 3, materia: 'Geografía', enunciado: '¿Cuál es el océano más grande de la Tierra?', opcion_a: 'Atlántico', opcion_b: 'Índico', opcion_c: 'Ártico', opcion_d: 'Pacífico', respuesta_correcta: 'D' },
  { id: 4, materia: 'Ciencias Naturales', enunciado: '¿Qué órgano bombea la sangre en el cuerpo humano?', opcion_a: 'El corazón', opcion_b: 'El hígado', opcion_c: 'Los pulmones', opcion_d: 'El estómago', respuesta_correcta: 'A' },
  { id: 5, materia: 'Geografía', enunciado: '¿Cuál es la capital de Ecuador?', opcion_a: 'Guayaquil', opcion_b: 'Cuenca', opcion_c: 'Quito', opcion_d: 'Ambato', respuesta_correcta: 'C' },
  { id: 6, materia: 'Matemáticas', enunciado: '¿Cuántos lados tiene un hexágono?', opcion_a: 'Cinco', opcion_b: 'Seis', opcion_c: 'Siete', opcion_d: 'Ocho', respuesta_correcta: 'B' },
  { id: 7, materia: 'Ciencias Naturales', enunciado: '¿Qué gas respiran las plantas para realizar la fotosíntesis?', opcion_a: 'Oxígeno', opcion_b: 'Nitrógeno', opcion_c: 'Dióxido de carbono', opcion_d: 'Hidrógeno', respuesta_correcta: 'C' },
  { id: 8, materia: 'Historia y Geografía', enunciado: '¿En qué continente se encuentra Egipto?', opcion_a: 'Asia', opcion_b: 'Europa', opcion_c: 'África', opcion_d: 'Oceanía', respuesta_correcta: 'C' },
  { id: 9, materia: 'Matemáticas', enunciado: '¿Cuál es el resultado de 144 dividido para 12?', opcion_a: '11', opcion_b: '12', opcion_c: '14', opcion_d: '10', respuesta_correcta: 'B' },
  { id: 10, materia: 'Lenguaje y Literatura', enunciado: '¿Quién escribió la novela Don Quijote de la Mancha?', opcion_a: 'Gabriel García Márquez', opcion_b: 'Miguel de Cervantes', opcion_c: 'Pablo Neruda', opcion_d: 'Mario Vargas Llosa', respuesta_correcta: 'B' },
  { id: 11, materia: 'Ciencias Naturales', enunciado: '¿Cuál es el símbolo químico del agua?', opcion_a: 'O2', opcion_b: 'CO2', opcion_c: 'H2O', opcion_d: 'NaCl', respuesta_correcta: 'C' },
  { id: 12, materia: 'Matemáticas', enunciado: '¿Cuántos minutos tiene una hora y media?', opcion_a: '60 minutos', opcion_b: '75 minutos', opcion_c: '90 minutos', opcion_d: '120 minutos', respuesta_correcta: 'C' }
];

const DEFAULT_DOCENTES = [
  { id: 1, nombre: 'Prof. Carlos Morales', correo: 'docente@clase.edu', clave: 'docente123', fecha_registro: new Date().toISOString() }
];

// Estructura de almacenamiento en memoria (fallback en caso de fallo nativo de SQLite en Node 22)
const memoryStore = {
  docentes: DEFAULT_DOCENTES.map(d => ({ ...d })),
  estudiantes: [],
  preguntas: DEFAULT_PREGUNTAS.map(p => ({ ...p })),
  resultados_partidas: []
};

let memNextId = {
  docentes: 2,
  estudiantes: 1,
  preguntas: 13,
  resultados_partidas: 1
};

let sqlite3 = null;
let db = null;
let isUsingMemoryStore = false;

// 1. Intentar cargar el módulo sqlite3 nativo de forma segura
try {
  sqlite3 = require('sqlite3').verbose();
} catch (loadErr) {
  console.warn('⚠️ Advertencia: No se pudo cargar sqlite3 nativo (común en Node 22 sin binarios precompilados):', loadErr.message);
  console.log('🛡️ Activando motor de base de datos en memoria para garantizar disponibilidad 100%.');
  isUsingMemoryStore = true;
}

// 2. Si sqlite3 está presente, intentar conectar a database.sqlite o :memory:
if (!isUsingMemoryStore && sqlite3) {
  try {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.warn('⚠️ Error al abrir database.sqlite en disco:', err.message);
        console.log('🔄 Intentando fallback a SQLite en memoria (:memory:)...');
        try {
          db = new sqlite3.Database(':memory:', (memErr) => {
            if (memErr) {
              console.warn('⚠️ SQLite :memory: no disponible, usando almacenamiento en memoria JS:', memErr.message);
              isUsingMemoryStore = true;
            } else {
              console.log('✅ Base de datos SQLite conectada en memoria (:memory:).');
            }
          });
        } catch (e) {
          isUsingMemoryStore = true;
        }
      } else {
        console.log('✅ Base de datos SQLite conectada en:', DB_PATH);
      }
    });
  } catch (initErr) {
    console.warn('⚠️ Excepción al inicializar sqlite3.Database:', initErr.message);
    isUsingMemoryStore = true;
  }
}

// Motor de consultas en memoria para fallback completo
function memoryExecute(type, sql, params = []) {
  const normSql = sql.trim().replace(/\s+/g, ' ');

  // DDL / Configuración
  if (/^(CREATE|PRAGMA)/i.test(normSql)) {
    return type === 'query' ? [] : (type === 'get' ? null : { lastID: 0, changes: 0 });
  }

  // INSERT INTO docentes
  if (/^INSERT INTO docentes/i.test(normSql)) {
    const id = memNextId.docentes++;
    const [nombre, correo, clave] = params;
    const item = { id, nombre, correo: String(correo || '').toLowerCase(), clave, fecha_registro: new Date().toISOString() };
    memoryStore.docentes.push(item);
    return { lastID: id, changes: 1 };
  }

  // INSERT INTO estudiantes
  if (/^INSERT INTO estudiantes/i.test(normSql)) {
    const id = memNextId.estudiantes++;
    const [nombres, apellidos, cedula, correo] = params;
    const item = { id, nombres, apellidos, cedula: String(cedula || ''), correo: String(correo || '').toLowerCase(), fecha_registro: new Date().toISOString() };
    memoryStore.estudiantes.push(item);
    return { lastID: id, changes: 1 };
  }

  // INSERT INTO preguntas
  if (/^INSERT INTO preguntas/i.test(normSql)) {
    const id = memNextId.preguntas++;
    const [materia, enunciado, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta] = params;
    const item = { id, materia, enunciado, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta: String(respuesta_correcta || '').toUpperCase() };
    memoryStore.preguntas.push(item);
    return { lastID: id, changes: 1 };
  }

  // INSERT INTO resultados_partidas
  if (/^INSERT INTO resultados_partidas/i.test(normSql)) {
    const id = memNextId.resultados_partidas++;
    const [estudiante_id, materia, aciertos, fallos, puntaje_final, gano] = params;
    const item = { id, estudiante_id, materia, aciertos, fallos, puntaje_final, gano, fecha: new Date().toISOString() };
    memoryStore.resultados_partidas.push(item);
    return { lastID: id, changes: 1 };
  }

  // DELETE FROM preguntas
  if (/^DELETE FROM preguntas WHERE id = \?/i.test(normSql)) {
    const targetId = parseInt(params[0], 10);
    const prev = memoryStore.preguntas.length;
    memoryStore.preguntas = memoryStore.preguntas.filter(p => p.id !== targetId);
    return { lastID: 0, changes: prev - memoryStore.preguntas.length };
  }

  // SELECT docentes
  if (/SELECT COUNT\(\*\) as total FROM docentes/i.test(normSql)) {
    const res = { total: memoryStore.docentes.length };
    return type === 'get' ? res : [res];
  }

  if (/SELECT \* FROM docentes WHERE LOWER\(correo\) = \?/i.test(normSql)) {
    const c = String(params[0] || '').toLowerCase();
    const item = memoryStore.docentes.find(d => d.correo.toLowerCase() === c) || null;
    return type === 'get' ? item : (item ? [item] : []);
  }

  if (/SELECT \* FROM docentes WHERE id = \?/i.test(normSql)) {
    const id = parseInt(params[0], 10);
    const item = memoryStore.docentes.find(d => d.id === id) || null;
    return type === 'get' ? item : (item ? [item] : []);
  }

  if (/SELECT .* FROM docentes/i.test(normSql)) {
    return memoryStore.docentes.map(d => ({ id: d.id, nombre: d.nombre, correo: d.correo, fecha_registro: d.fecha_registro }));
  }

  // SELECT estudiantes
  if (/SELECT \* FROM estudiantes WHERE LOWER\(cedula\) = \? OR LOWER\(correo\) = \?/i.test(normSql)) {
    const p0 = String(params[0] || '').toLowerCase();
    const p1 = String(params[1] || '').toLowerCase();
    const item = memoryStore.estudiantes.find(e => e.cedula.toLowerCase() === p0 || e.correo.toLowerCase() === p1) || null;
    return type === 'get' ? item : (item ? [item] : []);
  }

  if (/SELECT \* FROM estudiantes WHERE cedula = \?/i.test(normSql)) {
    const c = String(params[0] || '');
    const item = memoryStore.estudiantes.find(e => e.cedula === c) || null;
    return type === 'get' ? item : (item ? [item] : []);
  }

  if (/SELECT \* FROM estudiantes WHERE correo = \?/i.test(normSql)) {
    const c = String(params[0] || '').toLowerCase();
    const item = memoryStore.estudiantes.find(e => e.correo.toLowerCase() === c) || null;
    return type === 'get' ? item : (item ? [item] : []);
  }

  if (/SELECT \* FROM estudiantes WHERE id = \?/i.test(normSql)) {
    const id = parseInt(params[0], 10);
    const item = memoryStore.estudiantes.find(e => e.id === id) || null;
    return type === 'get' ? item : (item ? [item] : []);
  }

  if (/SELECT .* FROM estudiantes/i.test(normSql)) {
    return [...memoryStore.estudiantes];
  }

  // SELECT preguntas
  if (/SELECT COUNT\(\*\) as total FROM preguntas/i.test(normSql)) {
    const res = { total: memoryStore.preguntas.length };
    return type === 'get' ? res : [res];
  }

  if (/SELECT DISTINCT materia FROM preguntas/i.test(normSql)) {
    const mats = [...new Set(memoryStore.preguntas.map(p => p.materia))];
    return mats.map(materia => ({ materia }));
  }

  if (/SELECT \* FROM preguntas WHERE materia = \?/i.test(normSql)) {
    const mat = String(params[0] || '');
    return memoryStore.preguntas.filter(p => p.materia === mat);
  }

  if (/SELECT \* FROM preguntas/i.test(normSql)) {
    return [...memoryStore.preguntas];
  }

  // SELECT resultados_partidas
  if (/SELECT .* FROM resultados_partidas/i.test(normSql)) {
    return memoryStore.resultados_partidas.map(r => {
      const e = memoryStore.estudiantes.find(est => est.id === r.estudiante_id) || {};
      return {
        ...r,
        nombres: e.nombres || '',
        apellidos: e.apellidos || '',
        cedula: e.cedula || '',
        correo: e.correo || ''
      };
    }).reverse();
  }

  return type === 'query' ? [] : (type === 'get' ? null : { lastID: 0, changes: 0 });
}

// Promesas auxiliares para operaciones SQL limpias con respaldo automático
function run(sql, params = []) {
  if (isUsingMemoryStore || !db) {
    return Promise.resolve(memoryExecute('run', sql, params));
  }
  return new Promise((resolve) => {
    try {
      db.run(sql, params, function (err) {
        if (err) {
          console.warn('⚠️ Error en sqlite db.run (usando respaldo en memoria):', err.message);
          return resolve(memoryExecute('run', sql, params));
        }
        resolve({ lastID: this ? this.lastID : 0, changes: this ? this.changes : 0 });
      });
    } catch (e) {
      console.warn('⚠️ Excepción en db.run (usando respaldo en memoria):', e.message);
      resolve(memoryExecute('run', sql, params));
    }
  });
}

function get(sql, params = []) {
  if (isUsingMemoryStore || !db) {
    return Promise.resolve(memoryExecute('get', sql, params));
  }
  return new Promise((resolve) => {
    try {
      db.get(sql, params, (err, row) => {
        if (err) {
          console.warn('⚠️ Error en sqlite db.get (usando respaldo en memoria):', err.message);
          return resolve(memoryExecute('get', sql, params));
        }
        resolve(row || null);
      });
    } catch (e) {
      console.warn('⚠️ Excepción en db.get (usando respaldo en memoria):', e.message);
      resolve(memoryExecute('get', sql, params));
    }
  });
}

function query(sql, params = []) {
  if (isUsingMemoryStore || !db) {
    return Promise.resolve(memoryExecute('query', sql, params));
  }
  return new Promise((resolve) => {
    try {
      db.all(sql, params, (err, rows) => {
        if (err) {
          console.warn('⚠️ Error en sqlite db.all (usando respaldo en memoria):', err.message);
          return resolve(memoryExecute('query', sql, params));
        }
        resolve(rows || []);
      });
    } catch (e) {
      console.warn('⚠️ Excepción en db.all (usando respaldo en memoria):', e.message);
      resolve(memoryExecute('query', sql, params));
    }
  });
}

// Inicialización de tablas requeridas envuelta en try/catch total
async function initDatabase() {
  try {
    await run('PRAGMA foreign_keys = ON;');

    // 1. Tabla docentes
    await run(`
      CREATE TABLE IF NOT EXISTS docentes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        correo TEXT UNIQUE NOT NULL,
        clave TEXT NOT NULL,
        fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Tabla estudiantes
    await run(`
      CREATE TABLE IF NOT EXISTS estudiantes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombres TEXT NOT NULL,
        apellidos TEXT NOT NULL,
        cedula TEXT UNIQUE NOT NULL,
        correo TEXT UNIQUE NOT NULL,
        fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Tabla preguntas
    await run(`
      CREATE TABLE IF NOT EXISTS preguntas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        materia TEXT NOT NULL,
        enunciado TEXT NOT NULL,
        opcion_a TEXT NOT NULL,
        opcion_b TEXT NOT NULL,
        opcion_c TEXT NOT NULL,
        opcion_d TEXT NOT NULL,
        respuesta_correcta TEXT NOT NULL
      );
    `);

    // 4. Tabla resultados_partidas
    await run(`
      CREATE TABLE IF NOT EXISTS resultados_partidas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
        estudiante_id INTEGER NOT NULL,
        materia TEXT NOT NULL,
        aciertos INTEGER DEFAULT 0,
        fallos INTEGER DEFAULT 0,
        puntaje_final INTEGER DEFAULT 0,
        gano INTEGER DEFAULT 0,
        FOREIGN KEY (estudiante_id) REFERENCES estudiantes (id)
      );
    `);

    // Semilla inicial del docente de demostración si la tabla está vacía
    const docenteCount = await get('SELECT COUNT(*) as total FROM docentes');
    if (docenteCount && docenteCount.total === 0) {
      await run(
        'INSERT INTO docentes (nombre, correo, clave) VALUES (?, ?, ?)',
        ['Prof. Carlos Morales', 'docente@clase.edu', 'docente123']
      );
      console.log('📌 Docente de demostración inicializado (docente@clase.edu / docente123)');
    }

    // Semilla de preguntas iniciales si la tabla está vacía
    const pregCount = await get('SELECT COUNT(*) as total FROM preguntas');
    if (pregCount && pregCount.total === 0) {
      for (const q of DEFAULT_PREGUNTAS) {
        await run(
          `INSERT INTO preguntas (materia, enunciado, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [q.materia, q.enunciado, q.opcion_a, q.opcion_b, q.opcion_c, q.opcion_d, q.respuesta_correcta]
        );
      }
      console.log(`📌 Se inicializaron ${DEFAULT_PREGUNTAS.length} preguntas educativas por defecto`);
    }

    return true;
  } catch (err) {
    console.warn('⚠️ Advertencia durante initDatabase (activando motor en memoria):', err.message);
    isUsingMemoryStore = true;
    return true;
  }
}

module.exports = {
  db,
  DB_PATH,
  run,
  get,
  query,
  initDatabase,
  memoryStore
};
