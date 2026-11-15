export const fixtureHashes = Object.freeze({
  "historia": "2238af7b677208cc3a3613d988dc43c0810284744e563e9ce88d646dfffbd5bf",
  "apoyo": "ca314bc71ca49c75ac2b9f4dc7102d7858e602fd13eaf49a6821afc581ad5dd4",
  "certificate": "53ebb75b8e37218a3bad4b738acd05450d6703d7e88a40585919d5e64cef12fe"
});

export function fixtureAllowed({kind,sha}) {
  return Object.hasOwn(fixtureHashes,kind) && fixtureHashes[kind] === sha;
}

export function profileAllowed({name,documentType,documentNumber,phone,support,zone,representation}) {
  return name === 'Persona de prueba' && documentType === 'CC' && documentNumber === 'TEST001'
    && phone === '' && support === ''
    && ['Cabecera municipal','Centro poblado','Zona rural dispersa'].includes(zone)
    && ['propia','apoyo'].includes(representation);
}

export function citizenMayDownload(entry,uid,kind) {
  return kind === 'certificate' && entry?.ownerUid === uid && !!entry.certificate
    && ['sent','delivery_review','archived'].includes(entry.status);
}
