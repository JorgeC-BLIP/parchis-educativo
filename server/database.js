const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Ruta persistente del archivo database.sqlite en la raíz del proyecto
const DB_PATH = path.resolve(__dirname, '../database.sqlite');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Error al conectar con SQLite:', err.message);
  } else {
    console.log('✅ Base de datos SQLite conectada en:', DB_PATH);
  }
});

// Promesas auxiliares para operaciones SQL limpias
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

// Inicialización de tablas requeridas
async function initDatabase() {
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
    const defaultQuestions = [
      {
        materia: 'Cultura General',
        enunciado: '¿Cuál es el planeta más grande del sistema solar?',
        opcion_a: 'Marte',
        opcion_b: 'Júpiter',
        opcion_c: 'Saturno',
        opcion_d: 'Neptuno',
        respuesta_correcta: 'B'
      },
      {
        materia: 'Matemáticas',
        enunciado: '¿Cuánto es 8 x 7?',
        opcion_a: '54',
        opcion_b: '64',
        opcion_c: '56',
        opcion_d: '48',
        respuesta_correcta: 'C'
      },
      {
        materia: 'Geografía',
        enunciado: '¿Cuál es el océano más grande de la Tierra?',
        opcion_a: 'Atlántico',
        opcion_b: 'Índico',
        opcion_c: 'Ártico',
        opcion_d: 'Pacífico',
        respuesta_correcta: 'D'
      },
      {
        materia: 'Ciencias Naturales',
        enunciado: '¿Qué órgano bombea la sangre en el cuerpo humano?',
        opcion_a: 'El corazón',
        opcion_b: 'El hígado',
        opcion_c: 'Los pulmones',
        opcion_d: 'El estómago',
        respuesta_correcta: 'A'
      },
      {
        materia: 'Geografía',
        enunciado: '¿Cuál es la capital de Ecuador?',
        opcion_a: 'Guayaquil',
        opcion_b: 'Cuenca',
        opcion_c: 'Quito',
        opcion_d: 'Ambato',
        respuesta_correcta: 'C'
      },
      {
        materia: 'Matemáticas',
        enunciado: '¿Cuántos lados tiene un hexágono?',
        opcion_a: 'Cinco',
        opcion_b: 'Seis',
        opcion_c: 'Siete',
        opcion_d: 'Ocho',
        respuesta_correcta: 'B'
      },
      {
        materia: 'Ciencias Naturales',
        enunciado: '¿Qué gas respiran las plantas para realizar la fotosíntesis?',
        opcion_a: 'Oxígeno',
        opcion_b: 'Nitrógeno',
        opcion_c: 'Dióxido de carbono',
        opcion_d: 'Hidrógeno',
        respuesta_correcta: 'C'
      },
      {
        materia: 'Historia y Geografía',
        enunciado: '¿En qué continente se encuentra Egipto?',
        opcion_a: 'Asia',
        opcion_b: 'Europa',
        opcion_c: 'África',
        opcion_d: 'Oceanía',
        respuesta_correcta: 'C'
      },
      {
        materia: 'Matemáticas',
        enunciado: '¿Cuál es el resultado de 144 dividido para 12?',
        opcion_a: '11',
        opcion_b: '12',
        opcion_c: '14',
        opcion_d: '10',
        respuesta_correcta: 'B'
      },
      {
        materia: 'Lenguaje y Literatura',
        enunciado: '¿Quién escribió la novela Don Quijote de la Mancha?',
        opcion_a: 'Gabriel García Márquez',
        opcion_b: 'Miguel de Cervantes',
        opcion_c: 'Pablo Neruda',
        opcion_d: 'Mario Vargas Llosa',
        respuesta_correcta: 'B'
      },
      {
        materia: 'Ciencias Naturales',
        enunciado: '¿Cuál es el símbolo químico del agua?',
        opcion_a: 'O2',
        opcion_b: 'CO2',
        opcion_c: 'H2O',
        opcion_d: 'NaCl',
        respuesta_correcta: 'C'
      },
      {
        materia: 'Matemáticas',
        enunciado: '¿Cuántos minutos tiene una hora y media?',
        opcion_a: '60 minutos',
        opcion_b: '75 minutos',
        opcion_c: '90 minutos',
        opcion_d: '120 minutos',
        respuesta_correcta: 'C'
      }
    ];

    for (const q of defaultQuestions) {
      await run(
        `INSERT INTO preguntas (materia, enunciado, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [q.materia, q.enunciado, q.opcion_a, q.opcion_b, q.opcion_c, q.opcion_d, q.respuesta_correcta]
      );
    }
    console.log(`📌 Se inicializaron ${defaultQuestions.length} preguntas educativas por defecto`);
  }
}

module.exports = {
  db,
  DB_PATH,
  run,
  get,
  query,
  initDatabase
};

