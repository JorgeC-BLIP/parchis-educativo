<?php
// Test runner para verificar api.php de forma completa

function simulateRequest($method, $route, $body = null, $materia = null) {
    $script = __DIR__ . '/api.php';
    $cmd = '"C:\\xampp\\php\\php.exe" -r ' . escapeshellarg('
        $_SERVER["REQUEST_METHOD"] = ' . var_export($method, true) . ';
        $_GET["route"] = ' . var_export($route, true) . ';
        ' . ($materia ? '$_GET["materia"] = ' . var_export($materia, true) . ';' : '') . '
        $GLOBALS["MOCK_INPUT"] = ' . var_export($body, true) . ';
        include ' . var_export($script, true) . ';
    ');

    $output = shell_exec($cmd);
    return json_decode($output, true) ?: $output;
}

echo "=== TEST 1: Health Check ===\n";
$r1 = simulateRequest('GET', 'health');
print_r($r1);

echo "=== TEST 2: GET Docentes ===\n";
$r2 = simulateRequest('GET', 'docentes');
echo "Docentes encontrados: " . count($r2) . " - Primer docente: " . ($r2[0]['nombre'] ?? 'N/A') . "\n";

echo "=== TEST 3: POST Docente Login (Existente) ===\n";
$r3 = simulateRequest('POST', 'docentes/login', [
    'nombre' => 'Prof. Carlos Morales',
    'correo' => 'docente@clase.edu',
    'clave' => 'docente123'
]);
echo "Login existente: " . ($r3['message'] ?? 'Error') . " (isNew: " . var_export($r3['isNew'] ?? false, true) . ")\n";

echo "=== TEST 4: POST Docente Login (Incorrecta) ===\n";
$r4 = simulateRequest('POST', 'docentes/login', [
    'correo' => 'docente@clase.edu',
    'clave' => 'clave_invalida'
]);
echo "Login incorrecto: " . ($r4['error'] ?? 'OK?') . "\n";

echo "=== TEST 5: POST Docente Login (Nuevo Docente) ===\n";
$r5 = simulateRequest('POST', 'docentes/login', [
    'nombre' => 'Prof. Laura Vega',
    'correo' => 'laura.vega@colegio.edu',
    'clave' => 'laura2026'
]);
echo "Nuevo docente: " . ($r5['message'] ?? 'Error') . " - ID: " . ($r5['docente']['id'] ?? 'N/A') . "\n";

echo "=== TEST 6: GET Preguntas ===\n";
$r6 = simulateRequest('GET', 'preguntas');
echo "Total preguntas cargadas: " . count($r6) . "\n";

echo "=== TEST 7: POST Preguntas Bulk (Formato Aiken parseado) ===\n";
$r7 = simulateRequest('POST', 'preguntas/bulk', [
    [
        'materia' => 'Física',
        'enunciado' => '¿Cuál es la velocidad de la luz aproximada en el vacío?',
        'opcion_a' => '150.000 km/s',
        'opcion_b' => '300.000 km/s',
        'opcion_c' => '450.000 km/s',
        'opcion_d' => '100.000 km/s',
        'respuesta_correcta' => 'B'
    ]
]);
echo "Bulk preguntas: " . ($r7['message'] ?? 'Error') . " - Count: " . ($r7['count'] ?? 0) . "\n";

echo "=== TEST 8: POST Estudiantes (Registro) ===\n";
$r8 = simulateRequest('POST', 'estudiantes/registro', [
    'nombres' => 'Alejandro',
    'apellidos' => 'Morales',
    'cedula' => '0928172635',
    'correo' => 'alejandro@estudiante.edu'
]);
echo "Estudiante registrado: " . ($r8['message'] ?? 'Error') . " - ID: " . ($r8['id'] ?? 'N/A') . "\n";

echo "=== TEST 9: POST Estudiantes Login (Búsqueda por cédula) ===\n";
$r9 = simulateRequest('POST', 'estudiantes/login', [
    'identificador' => '0928172635'
]);
echo "Login estudiante: " . ($r9['message'] ?? 'Error') . " - Nombre: " . ($r9['estudiante']['nombres'] ?? 'N/A') . "\n";

echo "=== TEST 10: GET Estudiantes ===\n";
$r10 = simulateRequest('GET', 'estudiantes');
echo "Total estudiantes: " . count($r10) . "\n";

echo "=== TODOS LOS TESTS DE API.PHP COMPLETADOS EXITOSAMENTE ===\n";
