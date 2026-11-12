<?php
/**
 * Backend API en PHP + SQLite para "Parchís Educativo"
 * Diseñado para despliegue en hosting compartido (Hostinger, cPanel, Apache/LiteSpeed).
 */

if (!headers_sent()) {
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Origin, X-Requested-With, Content-Type, Accept, Authorization');
}

// Responder de inmediato a solicitudes preflight OPTIONS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Conexión permanente a base de datos SQLite mediante PDO
$dbPath = __DIR__ . '/database.sqlite';
try {
    $pdo = new PDO('sqlite:' . $dbPath);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('PRAGMA foreign_keys = ON;');
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Error al conectar con SQLite: ' . $e->getMessage()]);
    exit;
}

// Inicialización automática de tablas requeridas
function initDatabase($pdo) {
    // 1. Tabla docentes
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS docentes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            correo TEXT UNIQUE NOT NULL,
            clave TEXT NOT NULL,
            fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    ");

    // 2. Tabla estudiantes
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS estudiantes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombres TEXT NOT NULL,
            apellidos TEXT NOT NULL,
            cedula TEXT UNIQUE NOT NULL,
            correo TEXT UNIQUE NOT NULL,
            fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    ");

    // 3. Tabla preguntas
    $pdo->exec("
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
    ");

    // 4. Tabla resultados_partidas
    $pdo->exec("
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
    ");

    // Semilla inicial de cuenta docente de demostración
    $docenteCount = $pdo->query("SELECT COUNT(*) FROM docentes")->fetchColumn();
    if ($docenteCount == 0) {
        $stmt = $pdo->prepare("INSERT INTO docentes (nombre, correo, clave) VALUES (?, ?, ?)");
        $stmt->execute(['Prof. Carlos Morales', 'docente@clase.edu', 'docente123']);
    }

    // Semilla inicial de preguntas educativas si la tabla está vacía
    $pregCount = $pdo->query("SELECT COUNT(*) FROM preguntas")->fetchColumn();
    if ($pregCount == 0) {
        $preguntasIniciales = [
            ['Cultura General', '¿Cuál es el planeta más grande del sistema solar?', 'Marte', 'Júpiter', 'Saturno', 'Neptuno', 'B'],
            ['Matemáticas', '¿Cuánto es 8 x 7?', '54', '64', '56', '48', 'C'],
            ['Geografía', '¿Cuál es el océano más grande de la Tierra?', 'Atlántico', 'Índico', 'Ártico', 'Pacífico', 'D'],
            ['Ciencias Naturales', '¿Qué órgano bombea la sangre en el cuerpo humano?', 'El corazón', 'El hígado', 'Los pulmones', 'El estómago', 'A'],
            ['Geografía', '¿Cuál es la capital de Ecuador?', 'Guayaquil', 'Cuenca', 'Quito', 'Ambato', 'C'],
            ['Matemáticas', '¿Cuántos lados tiene un hexágono?', 'Cinco', 'Seis', 'Siete', 'Ocho', 'B'],
            ['Ciencias Naturales', '¿Qué gas respiran las plantas para realizar la fotosíntesis?', 'Oxígeno', 'Nitrógeno', 'Dióxido de carbono', 'Hidrógeno', 'C'],
            ['Historia y Geografía', '¿En qué continente se encuentra Egipto?', 'Asia', 'Europa', 'África', 'Oceanía', 'C'],
            ['Matemáticas', '¿Cuál es el resultado de 144 dividido para 12?', '11', '12', '14', '10', 'B'],
            ['Lenguaje y Literatura', '¿Quién escribió la novela Don Quijote de la Mancha?', 'Gabriel García Márquez', 'Miguel de Cervantes', 'Pablo Neruda', 'Mario Vargas Llosa', 'B'],
            ['Ciencias Naturales', '¿Cuál es el símbolo químico del agua?', 'O2', 'CO2', 'H2O', 'NaCl', 'C'],
            ['Matemáticas', '¿Cuántos minutos tiene una hora y media?', '60 minutos', '75 minutos', '90 minutos', '120 minutos', 'C']
        ];

        $ins = $pdo->prepare("INSERT INTO preguntas (materia, enunciado, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta) VALUES (?, ?, ?, ?, ?, ?, ?)");
        $pdo->beginTransaction();
        foreach ($preguntasIniciales as $p) {
            $ins->execute($p);
        }
        $pdo->commit();
    }
}

initDatabase($pdo);

// Extracción unificada y limpia de la ruta (vía ?route=, PATH_INFO o REQUEST_URI)
$route = '';
if (isset($_GET['route']) && $_GET['route'] !== '') {
    $route = trim($_GET['route'], '/');
} elseif (isset($_SERVER['PATH_INFO']) && $_SERVER['PATH_INFO'] !== '') {
    $route = trim($_SERVER['PATH_INFO'], '/');
} else {
    $uri = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH);
    if (preg_match('#/api/(.*)$#', $uri, $matches)) {
        $route = trim($matches[1], '/');
    } elseif (preg_match('#/api$#', $uri)) {
        $route = '';
    } else {
        $route = trim($uri, '/');
    }
}

// Normalizar prefijo 'api/' si estuviera presente
if (strpos($route, 'api/') === 0) {
    $route = substr($route, 4);
}
if ($route === 'api') {
    $route = '';
}

$method = $_SERVER['REQUEST_METHOD'];

// Leer cuerpo JSON (compatible con servidores web vía php://input y entornos CLI vía php://stdin)
$inputRaw = file_get_contents('php://input');
if ($inputRaw === false || $inputRaw === '') {
    $inputRaw = @file_get_contents('php://stdin') ?: '';
}
$input = json_decode($inputRaw, true);
if (!is_array($input)) {
    $input = $_POST ?: [];
}

try {
    // =========================================================================
    // 0. HEALTH CHECK
    // =========================================================================
    if ($method === 'GET' && ($route === '' || $route === 'health')) {
        echo json_encode(['status' => 'ok', 'time' => date('c'), 'engine' => 'PHP ' . PHP_VERSION]);
        exit;
    }

    // =========================================================================
    // 1. ENDPOINTS DE DOCENTES (/api/docentes)
    // =========================================================================

    // POST /api/docentes/login (Validar o registrar automáticamente)
    if ($method === 'POST' && $route === 'docentes/login') {
        $correo = strtolower(trim($input['correo'] ?? ''));
        $clave = $input['clave'] ?? '';
        $nombre = trim($input['nombre'] ?? 'Docente');

        if (!$correo || !$clave) {
            http_response_code(400);
            echo json_encode(['error' => 'El correo y la contraseña son obligatorios.']);
            exit;
        }

        $stmt = $pdo->prepare('SELECT * FROM docentes WHERE LOWER(correo) = ?');
        $stmt->execute([$correo]);
        $docente = $stmt->fetch();

        if ($docente) {
            if ($docente['clave'] !== $clave) {
                http_response_code(401);
                echo json_encode(['error' => 'Contraseña incorrecta para esta cuenta docente.']);
                exit;
            }
            echo json_encode([
                'message' => 'Inicio de sesión docente exitoso.',
                'docente' => [
                    'id' => (int)$docente['id'],
                    'nombre' => $docente['nombre'],
                    'correo' => $docente['correo']
                ],
                'isNew' => false
            ]);
            exit;
        }

        // Si no existe, registrar nuevo docente en SQLite
        $cleanNombre = $nombre !== '' ? $nombre : 'Docente';
        $insert = $pdo->prepare('INSERT INTO docentes (nombre, correo, clave) VALUES (?, ?, ?)');
        $insert->execute([$cleanNombre, $correo, $clave]);
        $newId = (int)$pdo->lastInsertId();

        http_response_code(201);
        echo json_encode([
            'message' => 'Cuenta docente registrada en base de datos.',
            'docente' => [
                'id' => $newId,
                'nombre' => $cleanNombre,
                'correo' => $correo
            ],
            'isNew' => true
        ]);
        exit;
    }

    // GET /api/docentes
    if ($method === 'GET' && $route === 'docentes') {
        $stmt = $pdo->query('SELECT id, nombre, correo, fecha_registro FROM docentes ORDER BY id ASC');
        $rows = $stmt->fetchAll();
        foreach ($rows as &$r) $r['id'] = (int)$r['id'];
        echo json_encode($rows);
        exit;
    }

    // POST /api/docentes (Registro manual)
    if ($method === 'POST' && $route === 'docentes') {
        $nombre = trim($input['nombre'] ?? '');
        $correo = strtolower(trim($input['correo'] ?? ''));
        $clave = $input['clave'] ?? '';

        if (!$nombre || !$correo || !$clave) {
            http_response_code(400);
            echo json_encode(['error' => 'Nombre, correo y clave son obligatorios.']);
            exit;
        }

        $stmt = $pdo->prepare('SELECT id FROM docentes WHERE LOWER(correo) = ?');
        $stmt->execute([$correo]);
        if ($stmt->fetch()) {
            http_response_code(409);
            echo json_encode(['error' => 'Ya existe un docente con este correo.']);
            exit;
        }

        $ins = $pdo->prepare('INSERT INTO docentes (nombre, correo, clave) VALUES (?, ?, ?)');
        $ins->execute([$nombre, $correo, $clave]);
        $id = (int)$pdo->lastInsertId();

        http_response_code(201);
        echo json_encode([
            'id' => $id,
            'message' => 'Docente registrado exitosamente.',
            'docente' => ['id' => $id, 'nombre' => $nombre, 'correo' => $correo]
        ]);
        exit;
    }

    // DELETE /api/docentes/{id}
    if ($method === 'DELETE' && preg_match('#^docentes/(\d+)$#', $route, $matches)) {
        $id = (int)$matches[1];
        $del = $pdo->prepare('DELETE FROM docentes WHERE id = ?');
        $del->execute([$id]);
        echo json_encode(['message' => 'Docente eliminado correctamente.', 'id' => $id]);
        exit;
    }

    // =========================================================================
    // 2. ENDPOINTS DE ESTUDIANTES (/api/estudiantes)
    // =========================================================================

    // GET /api/estudiantes
    if ($method === 'GET' && $route === 'estudiantes') {
        $stmt = $pdo->query('SELECT id, nombres, apellidos, cedula, correo, fecha_registro FROM estudiantes ORDER BY id DESC');
        $rows = $stmt->fetchAll();
        foreach ($rows as &$r) $r['id'] = (int)$r['id'];
        echo json_encode($rows);
        exit;
    }

    // POST /api/estudiantes y POST /api/estudiantes/registro
    if ($method === 'POST' && ($route === 'estudiantes' || $route === 'estudiantes/registro')) {
        $nombres = trim($input['nombres'] ?? '');
        $apellidos = trim($input['apellidos'] ?? '');
        $cedula = trim($input['cedula'] ?? '');
        $correo = strtolower(trim($input['correo'] ?? ''));

        if (!$nombres || !$apellidos || !$cedula || !$correo) {
            http_response_code(400);
            echo json_encode(['error' => 'Todos los campos son obligatorios (nombres, apellidos, cédula, correo).']);
            exit;
        }

        // Validar duplicados en SQLite
        $stmt = $pdo->prepare('SELECT id FROM estudiantes WHERE cedula = ? OR LOWER(correo) = ?');
        $stmt->execute([$cedula, $correo]);
        if ($stmt->fetch()) {
            http_response_code(409);
            echo json_encode(['error' => 'Ya existe un estudiante registrado con esa cédula o correo.']);
            exit;
        }

        $ins = $pdo->prepare('INSERT INTO estudiantes (nombres, apellidos, cedula, correo) VALUES (?, ?, ?, ?)');
        $ins->execute([$nombres, $apellidos, $cedula, $correo]);
        $newId = (int)$pdo->lastInsertId();

        http_response_code(201);
        echo json_encode([
            'message' => 'Estudiante guardado en base de datos.',
            'id' => $newId,
            'estudiante' => [
                'id' => $newId,
                'nombres' => $nombres,
                'apellidos' => $apellidos,
                'cedula' => $cedula,
                'correo' => $correo
            ]
        ]);
        exit;
    }

    // POST /api/estudiantes/login (Búsqueda rápida por cédula o correo)
    if ($method === 'POST' && $route === 'estudiantes/login') {
        $ident = strtolower(trim($input['identificador'] ?? ''));
        if (!$ident) {
            http_response_code(400);
            echo json_encode(['error' => 'Identificador (cédula o correo) requerido.']);
            exit;
        }

        $stmt = $pdo->prepare('SELECT id, nombres, apellidos, cedula, correo, fecha_registro FROM estudiantes WHERE cedula = ? OR LOWER(correo) = ?');
        $stmt->execute([$ident, $ident]);
        $estudiante = $stmt->fetch();

        if (!$estudiante) {
            http_response_code(404);
            echo json_encode(['error' => 'Estudiante no encontrado. Regístralo primero.']);
            exit;
        }

        $estudiante['id'] = (int)$estudiante['id'];
        echo json_encode(['message' => 'Estudiante autenticado con éxito.', 'estudiante' => $estudiante]);
        exit;
    }

    // DELETE /api/estudiantes/{id}
    if ($method === 'DELETE' && preg_match('#^estudiantes/(\d+)$#', $route, $matches)) {
        $id = (int)$matches[1];
        $del = $pdo->prepare('DELETE FROM estudiantes WHERE id = ?');
        $del->execute([$id]);
        echo json_encode(['message' => 'Estudiante eliminado', 'id' => $id]);
        exit;
    }

    // =========================================================================
    // 3. ENDPOINTS DE PREGUNTAS (/api/preguntas)
    // =========================================================================

    // GET /api/preguntas (con filtro opcional ?materia=...)
    if ($method === 'GET' && $route === 'preguntas') {
        $materia = $_GET['materia'] ?? null;
        if ($materia && $materia !== 'TODAS') {
            $stmt = $pdo->prepare('SELECT * FROM preguntas WHERE materia = ? ORDER BY id ASC');
            $stmt->execute([$materia]);
        } else {
            $stmt = $pdo->query('SELECT * FROM preguntas ORDER BY id ASC');
        }
        $rows = $stmt->fetchAll();
        foreach ($rows as &$r) $r['id'] = (int)$r['id'];
        echo json_encode($rows);
        exit;
    }

    // POST /api/preguntas/bulk (Inserción masiva en formato Aiken o JSON)
    if ($method === 'POST' && $route === 'preguntas/bulk') {
        $preguntas = isset($input['preguntas']) ? $input['preguntas'] : $input;
        if (!is_array($preguntas) || empty($preguntas)) {
            http_response_code(400);
            echo json_encode(['error' => 'No se enviaron preguntas válidas para inserción masiva.']);
            exit;
        }

        $stmt = $pdo->prepare('
            INSERT INTO preguntas (materia, enunciado, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ');

        $pdo->beginTransaction();
        $count = 0;
        foreach ($preguntas as $q) {
            if (!empty($q['materia']) && !empty($q['enunciado']) && !empty($q['opcion_a']) &&
                !empty($q['opcion_b']) && !empty($q['opcion_c']) && !empty($q['opcion_d']) &&
                !empty($q['respuesta_correcta'])) {
                $stmt->execute([
                    trim($q['materia']),
                    trim($q['enunciado']),
                    trim($q['opcion_a']),
                    trim($q['opcion_b']),
                    trim($q['opcion_c']),
                    trim($q['opcion_d']),
                    strtoupper(trim($q['respuesta_correcta']))
                ]);
                $count++;
            }
        }
        $pdo->commit();

        http_response_code(201);
        echo json_encode([
            'message' => "Se guardaron {$count} preguntas con éxito.",
            'count' => $count
        ]);
        exit;
    }

    // POST /api/preguntas (Pregunta individual)
    if ($method === 'POST' && $route === 'preguntas') {
        $materia = trim($input['materia'] ?? '');
        $enunciado = trim($input['enunciado'] ?? '');
        $opcion_a = trim($input['opcion_a'] ?? '');
        $opcion_b = trim($input['opcion_b'] ?? '');
        $opcion_c = trim($input['opcion_c'] ?? '');
        $opcion_d = trim($input['opcion_d'] ?? '');
        $correcta = strtoupper(trim($input['respuesta_correcta'] ?? ''));

        if (!$materia || !$enunciado || !$opcion_a || !$opcion_b || !$opcion_c || !$opcion_d || !$correcta) {
            http_response_code(400);
            echo json_encode(['error' => 'Todos los campos de la pregunta son requeridos.']);
            exit;
        }

        $ins = $pdo->prepare('
            INSERT INTO preguntas (materia, enunciado, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ');
        $ins->execute([$materia, $enunciado, $opcion_a, $opcion_b, $opcion_c, $opcion_d, $correcta]);
        $newId = (int)$pdo->lastInsertId();

        http_response_code(201);
        echo json_encode([
            'message' => 'Pregunta guardada en base de datos.',
            'id' => $newId,
            'pregunta' => [
                'id' => $newId,
                'materia' => $materia,
                'enunciado' => $enunciado,
                'opcion_a' => $opcion_a,
                'opcion_b' => $opcion_b,
                'opcion_c' => $opcion_c,
                'opcion_d' => $opcion_d,
                'respuesta_correcta' => $correcta
            ]
        ]);
        exit;
    }

    // DELETE /api/preguntas/{id}
    if ($method === 'DELETE' && preg_match('#^preguntas/(\d+)$#', $route, $matches)) {
        $id = (int)$matches[1];
        $del = $pdo->prepare('DELETE FROM preguntas WHERE id = ?');
        $del->execute([$id]);
        echo json_encode(['message' => 'Pregunta eliminada de base de datos.', 'id' => $id]);
        exit;
    }

    // =========================================================================
    // 4. ENDPOINTS DE RESULTADOS DE PARTIDAS (/api/resultados)
    // =========================================================================

    // GET /api/resultados
    if ($method === 'GET' && $route === 'resultados') {
        $stmt = $pdo->query('
            SELECT r.*, e.nombres, e.apellidos, e.cedula, e.correo
            FROM resultados_partidas r
            JOIN estudiantes e ON r.estudiante_id = e.id
            ORDER BY r.id DESC
        ');
        $rows = $stmt->fetchAll();
        foreach ($rows as &$r) {
            $r['id'] = (int)$r['id'];
            $r['estudiante_id'] = (int)$r['estudiante_id'];
            $r['aciertos'] = (int)$r['aciertos'];
            $r['fallos'] = (int)$r['fallos'];
            $r['puntaje_final'] = (int)$r['puntaje_final'];
            $r['gano'] = (int)$r['gano'];
        }
        echo json_encode($rows);
        exit;
    }

    // POST /api/resultados
    if ($method === 'POST' && $route === 'resultados') {
        $estudiante_id = (int)($input['estudiante_id'] ?? 0);
        $materia = trim($input['materia'] ?? 'General');
        $aciertos = (int)($input['aciertos'] ?? 0);
        $fallos = (int)($input['fallos'] ?? 0);
        $puntaje = (int)($input['puntaje_final'] ?? 0);
        $gano = !empty($input['gano']) ? 1 : 0;

        $ins = $pdo->prepare('
            INSERT INTO resultados_partidas (estudiante_id, materia, aciertos, fallos, puntaje_final, gano)
            VALUES (?, ?, ?, ?, ?, ?)
        ');
        $ins->execute([$estudiante_id, $materia, $aciertos, $fallos, $puntaje, $gano]);
        $newId = (int)$pdo->lastInsertId();

        http_response_code(201);
        echo json_encode(['message' => 'Resultado registrado', 'id' => $newId]);
        exit;
    }

    // Ruta no encontrada
    http_response_code(404);
    echo json_encode([
        'error' => 'Ruta no encontrada.',
        'route' => $route,
        'method' => $method
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Error interno en el servidor PHP: ' . $e->getMessage()]);
}
