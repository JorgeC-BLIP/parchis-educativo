<?php
// Script de prueba integral

function runTest($method, $route, $input = null, $query = []) {
    $_SERVER['REQUEST_METHOD'] = $method;
    $_GET = array_merge(['route' => $route], $query);
    $GLOBALS['MOCK_INPUT'] = $input;
    
    ob_start();
    include __DIR__ . '/api.php';
    $out = ob_get_clean();
    return json_decode($out, true) ?: $out;
}

// 1. Login docente existente
echo "1. Login Docente Demo:\n";
$r1 = runTest('POST', 'docentes/login', [
    'nombre' => 'Prof. Carlos Morales',
    'correo' => 'docente@clase.edu',
    'clave' => 'docente123'
]);
echo json_encode($r1) . "\n\n";

// 2. Login docente incorrecto
echo "2. Login Docente Clave Incorrecta:\n";
$r2 = runTest('POST', 'docentes/login', [
    'correo' => 'docente@clase.edu',
    'clave' => 'clave_falsa'
]);
echo json_encode($r2) . "\n\n";

// 3. Registrar nuevo docente
echo "3. Registrar Nuevo Docente:\n";
$r3 = runTest('POST', 'docentes/login', [
    'nombre' => 'Lic. Gabriel Romero',
    'correo' => 'gabriel.romero@colegio.edu',
    'clave' => 'profe2026'
]);
echo json_encode($r3) . "\n\n";

// 4. Registrar estudiante
echo "4. Registrar Estudiante:\n";
$r4 = runTest('POST', 'estudiantes/registro', [
    'nombres' => 'Mateo',
    'apellidos' => 'Salazar',
    'cedula' => '0958473625',
    'correo' => 'mateo@colegio.edu'
]);
echo json_encode($r4) . "\n\n";

// 5. Login estudiante por cédula
echo "5. Login Estudiante por Cédula:\n";
$r5 = runTest('POST', 'estudiantes/login', [
    'identificador' => '0958473625'
]);
echo json_encode($r5) . "\n\n";

// 6. Inserción masiva de preguntas Aiken
echo "6. Inserción Masiva de Preguntas (Bulk):\n";
$r6 = runTest('POST', 'preguntas/bulk', [
    [
        'materia' => 'Literatura',
        'enunciado' => '¿Quién escribió Cien años de soledad?',
        'opcion_a' => 'Gabriel García Márquez',
        'opcion_b' => 'Jorge Luis Borges',
        'opcion_c' => 'Julio Cortázar',
        'opcion_d' => 'Mario Benedetti',
        'respuesta_correcta' => 'A'
    ]
]);
echo json_encode($r6) . "\n\n";

// 7. Listar preguntas con filtro de materia
echo "7. Listar Preguntas de Literatura:\n";
$r7 = runTest('GET', 'preguntas', null, ['materia' => 'Literatura']);
echo json_encode($r7) . "\n\n";

echo "¡Pruebas ejecutadas con éxito!\n";
