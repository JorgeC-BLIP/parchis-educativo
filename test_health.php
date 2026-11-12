<?php
$_SERVER['REQUEST_METHOD'] = 'GET';
$_GET['route'] = 'health';
include __DIR__ . '/api.php';
