const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const LOCAL_DIR = path.join(__dirname, 'dist');
const FTP_USER = 'YOUR_FTP_USER';
const FTP_PASS = 'YOUR_FTP_PASS';
const FTP_HOST = 'YOUR_FTP_HOST';
const REMOTE_ROOTS = [
  'public_html/ENJAMBRE',
  'domains/pepeamoedo.com/public_html/ENJAMBRE'
];

function getFilesRecursively(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(getFilesRecursively(fullPath));
    } else {
      results.push(fullPath);
    }
  });
  return results;
}

console.log('--- Iniciando Despliegue del Enjambre por FTP (Dual-Root) [EJEMPLO] ---');
const files = getFilesRecursively(LOCAL_DIR);
console.log(`Encontrados ${files.length} archivos locales en dist/ para subir.`);

files.forEach((file, index) => {
  const relPath = path.relative(LOCAL_DIR, file);
  
  REMOTE_ROOTS.forEach(root => {
    const remotePath = `${root}/${relPath.replace(/\\/g, '/')}`;
    console.log(`[${index + 1}/${files.length}] Subiendo ${relPath} -> ${remotePath}...`);
    const encodedRemotePath = remotePath.split('/').map(segment => encodeURIComponent(segment)).join('/');
    
    // Usar curl para subir por FTP
    const curlCmd = `curl -T "${file}" "ftp://${FTP_HOST}/${encodedRemotePath}" --user "${FTP_USER}:${FTP_PASS}" --ftp-create-dirs --silent --show-error`;
    try {
      execSync(curlCmd);
    } catch (err) {
      console.error(`Error subiendo ${relPath} a ${root}:`, err.message);
    }
  });
});

console.log('--- ¡Despliegue del Enjambre Completado con Éxito en Ambos Destinos! ---');
