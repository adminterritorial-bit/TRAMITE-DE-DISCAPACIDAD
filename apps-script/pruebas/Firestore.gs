// Read-only feasibility test for Spark. Paste into the Salud reception script.
function testFirestoreConnection() {
  const url = 'https://firestore.googleapis.com/v1/projects/tramite-discapacidad/databases/(default)/documents/users?pageSize=1&mask.fieldPaths=active';
  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: {Authorization: 'Bearer ' + ScriptApp.getOAuthToken()},
    muteHttpExceptions: true
  });
  const status = response.getResponseCode();
  console.log('Firestore REST: HTTP ' + status);
  if (status !== 200) {
    throw new Error('Firestore REST no autorizado o no disponible. HTTP ' + status);
  }
  console.log('Conexión Firestore REST correcta; no se modificaron documentos.');
}
